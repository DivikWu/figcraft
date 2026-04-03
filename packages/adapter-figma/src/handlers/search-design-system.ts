/**
 * search_design_system handler — unified search across library components,
 * variables, and styles via Figma Plugin API.
 *
 * Searches both local assets and subscribed team library assets.
 * Returns results ranked by relevance (exact > prefix > substring).
 */

import { registerHandler } from '../registry.js';
import { assertHandler } from '../utils/handler-error.js';

// ─── Fuzzy scoring ───
// Splits query into tokens and scores each candidate name.
// Exact match > prefix > substring > no match.

function scoreMatch(name: string, queryTokens: string[]): number {
  const lower = name.toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (lower === token) {
      score += 100; // exact match
    } else if (lower.startsWith(token)) {
      score += 60; // prefix
    } else {
      // Check path segments (e.g. "color/primary" matches "primary")
      const segments = lower.split(/[/\-_.]/);
      const segExact = segments.some((s) => s === token);
      const segPrefix = segments.some((s) => s.startsWith(token));
      if (segExact) {
        score += 80; // segment exact
      } else if (segPrefix) {
        score += 50; // segment prefix
      } else if (lower.includes(token)) {
        score += 30; // substring
      }
      // else: no match for this token, score += 0
    }
  }
  return score;
}

export function registerSearchDesignSystemHandler(): void {
  registerHandler('search_design_system', async (params) => {
    const query = ((params.query as string) || '').trim();
    assertHandler(query, 'query is required', 'VALIDATION_ERROR');

    const queryTokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    const typesParam = params.types as string[] | undefined;
    const types = new Set(typesParam && typesParam.length > 0 ? typesParam : ['components', 'variables', 'styles']);
    const limit = (params.limit as number) || 20;
    const selectedLibrary = (params.selectedLibrary as string | undefined) ?? null;
    const isLocalOnly = selectedLibrary === '__local__';

    const results: {
      components: Array<{
        key: string;
        name: string;
        description: string;
        isSet: boolean;
        libraryName: string;
        _score: number;
      }>;
      variables: Array<{
        key: string;
        name: string;
        resolvedType: string;
        collection: string;
        libraryName: string;
        _score: number;
      }>;
      styles: Array<{ key: string; name: string; styleType: string; _score: number }>;
    } = { components: [], variables: [], styles: [] };

    // ─── Search library variables ───
    // Skip team library search when local-only mode
    if (types.has('variables')) {
      if (!isLocalOnly) {
        try {
          let collections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
          // Filter to selected library when a specific library is chosen
          if (selectedLibrary) {
            collections = collections.filter((c) => c.libraryName === selectedLibrary);
          }
          // Process collections in parallel (each is an independent API call)
          const variableResults = await Promise.all(
            collections.map(async (coll) => {
              const vars = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(coll.key);
              const matched: typeof results.variables = [];
              for (const v of vars) {
                const score = scoreMatch(v.name, queryTokens);
                if (score > 0) {
                  matched.push({
                    key: v.key,
                    name: v.name,
                    resolvedType: v.resolvedType,
                    collection: coll.name,
                    libraryName: coll.libraryName,
                    _score: score,
                  });
                }
              }
              return matched;
            }),
          );
          results.variables = variableResults.flat();
        } catch (err) {
          console.warn('[figcraft] search_design_system: variable search failed:', err);
        }
      }

      // Also search local variables (may include imported ones)
      try {
        const seenVarKeys = new Set(results.variables.map((rv) => rv.key));
        const localCollections = await figma.variables.getLocalVariableCollectionsAsync();
        for (const coll of localCollections) {
          // Fetch all variables in this collection in parallel
          const vars = await Promise.all(coll.variableIds.map((varId) => figma.variables.getVariableByIdAsync(varId)));
          for (const v of vars) {
            if (!v) continue;
            const score = scoreMatch(v.name, queryTokens);
            if (score > 0 && !seenVarKeys.has(v.key)) {
              seenVarKeys.add(v.key);
              results.variables.push({
                key: v.key,
                name: v.name,
                resolvedType: v.resolvedType,
                collection: coll.name,
                libraryName: coll.remote ? '(remote)' : '(local)',
                _score: score,
              });
            }
          }
        }
      } catch (err) {
        console.warn('[figcraft] search_design_system: local variable search failed:', err);
      }
    }

    // ─── Search styles (local + imported) ───
    if (types.has('styles')) {
      try {
        const [paintStyles, textStyles, effectStyles] = await Promise.all([
          figma.getLocalPaintStylesAsync(),
          figma.getLocalTextStylesAsync(),
          figma.getLocalEffectStylesAsync(),
        ]);

        const allStyles = [
          ...paintStyles.map((s) => ({ key: s.key, name: s.name, styleType: 'PAINT' as const })),
          ...textStyles.map((s) => ({ key: s.key, name: s.name, styleType: 'TEXT' as const })),
          ...effectStyles.map((s) => ({ key: s.key, name: s.name, styleType: 'EFFECT' as const })),
        ];

        for (const s of allStyles) {
          const score = scoreMatch(s.name, queryTokens);
          if (score > 0) {
            results.styles.push({ ...s, _score: score });
          }
        }
      } catch (err) {
        console.warn('[figcraft] search_design_system: style search failed:', err);
      }
    }

    // ─── Search components ───
    // Plugin API has no teamLibrary.getAvailableComponentsAsync(),
    // so we search: (1) local components, (2) instances on current page → discover library components
    if (types.has('components')) {
      // Walk page once: collect local components + discover library components from instances
      const seen = new Set<string>();
      function walkPageNodes(node: SceneNode) {
        if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
          const comp = node as ComponentNode | ComponentSetNode;
          const score = scoreMatch(comp.name, queryTokens);
          if (score > 0 && !seen.has(comp.key)) {
            seen.add(comp.key);
            results.components.push({
              key: comp.key,
              name: comp.name,
              description: comp.description || '',
              isSet: node.type === 'COMPONENT_SET',
              libraryName: '(local)',
              _score: score,
            });
          }
        } else if (node.type === 'INSTANCE') {
          const inst = node as InstanceNode;
          const mc = inst.mainComponent;
          if (mc) {
            // In local-only mode, skip library (remote) instances
            if (isLocalOnly && mc.remote) {
              // still walk children below
            } else {
              const cs = mc.parent?.type === 'COMPONENT_SET' ? (mc.parent as ComponentSetNode) : null;
              const target = cs || mc;
              const score = scoreMatch(target.name, queryTokens);
              if (score > 0 && !seen.has(target.key)) {
                seen.add(target.key);
                results.components.push({
                  key: target.key,
                  name: target.name,
                  description: target.description || '',
                  isSet: !!cs,
                  libraryName: mc.remote ? '(library)' : '(local)',
                  _score: score,
                });
              }
            }
          }
        }
        if ('children' in node) {
          for (const child of (node as ChildrenMixin).children) {
            walkPageNodes(child as SceneNode);
          }
        }
      }
      for (const child of figma.currentPage.children) {
        walkPageNodes(child);
      }
    }

    // ─── Sort by score (descending) and limit ───
    const sortAndLimit = <T extends { _score: number }>(arr: T[]): Omit<T, '_score'>[] => {
      arr.sort((a, b) => b._score - a._score);
      return arr.slice(0, limit).map(({ _score, ...rest }) => rest as Omit<T, '_score'>);
    };

    const finalComponents = sortAndLimit(results.components);
    const finalVariables = sortAndLimit(results.variables);
    const finalStyles = sortAndLimit(results.styles);

    return {
      query,
      components: types.has('components') ? finalComponents : undefined,
      variables: types.has('variables') ? finalVariables : undefined,
      styles: types.has('styles') ? finalStyles : undefined,
      summary: {
        components: finalComponents.length,
        variables: finalVariables.length,
        styles: finalStyles.length,
      },
    };
  });
}
