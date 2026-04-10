/**
 * search_design_system — unified search across design system assets.
 *
 * Bridges to the Figma plugin for variable/style/component search,
 * and supplements with REST API for library components when a library
 * fileKey is available.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getToken } from '../auth.js';
import type { Bridge } from '../bridge.js';
import { fetchLibraryComponentSets, fetchLibraryComponents, groupComponentsBySet } from '../figma-api.js';
import { compactResponse, errorResponse } from './response-helpers.js';

// ─── Simple token-based scoring (mirrors plugin-side logic) ───

function scoreMatch(name: string, queryTokens: string[]): number {
  const lower = name.toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (lower === token) {
      score += 100;
    } else if (lower.startsWith(token)) {
      score += 60;
    } else {
      const segments = lower.split(/[/\-_.]/);
      const segExact = segments.some((s) => s === token);
      const segPrefix = segments.some((s) => s.startsWith(token));
      if (segExact) {
        score += 80;
      } else if (segPrefix) {
        score += 50;
      } else if (lower.includes(token)) {
        score += 30;
      }
    }
  }
  return score;
}

/**
 * Extended scoring that includes description and containingFrame context.
 * Adds bonus points when query tokens match category/description signals,
 * helping disambiguate components with similar names (e.g., Avatar vs Input
 * both having "Placeholder"/"Size" properties).
 */
function scoreMatchWithContext(
  name: string,
  description: string,
  containingFrame: string,
  queryTokens: string[],
): number {
  let score = scoreMatch(name, queryTokens);
  if (score === 0) return 0; // No name match → skip context bonus
  const descLower = description.toLowerCase();
  const frameLower = containingFrame.toLowerCase();
  for (const token of queryTokens) {
    if (frameLower.includes(token)) score += 20;
    if (descLower.includes(token)) score += 15;
  }
  return score;
}

export function registerSearchDesignSystemTool(server: McpServer, bridge: Bridge): void {
  server.tool(
    'search_design_system',
    'Search design system assets (components, variables, styles) across all ' +
      'subscribed team libraries by keyword. Returns matching results ranked by ' +
      'relevance. Use this to discover reusable design tokens, components, and ' +
      'styles before creating UI elements. ' +
      'Component results include isSet and containingFrame. ' +
      'When isSet=true, use componentSetKey + variantProperties in create_frame children. ' +
      'When isSet=false, use componentKey. ' +
      'Check containingFrame to verify component category (e.g., "Forms" vs "Avatars").',
    {
      query: z.string().describe('Search keyword (e.g. "primary", "button", "heading")'),
      types: z
        .array(z.string())
        .optional()
        .describe('Asset types to include: "components", "variables", "styles". Default: all three.'),
      limit: z.number().optional().describe('Max results per type (default: 20)'),
    },
    async ({ query, types: typesParam, limit: limitParam }) => {
      const queryTrimmed = query.trim();
      if (!queryTrimmed) {
        return errorResponse('query is required');
      }

      // Guard: skip search when explicitly no library selected (null).
      // undefined = unknown (get_mode not yet called) → proceed normally.
      // null = explicitly no library → skip.
      if (bridge.selectedLibrary === null) {
        return compactResponse({
          query: queryTrimmed,
          skipped: true,
          reason: 'No library selected. Select a library via set_mode before searching design system assets.',
          components: [],
          variables: [],
          styles: [],
          summary: { components: 0, variables: 0, styles: 0 },
        });
      }

      const types = new Set(typesParam && typesParam.length > 0 ? typesParam : ['components', 'variables', 'styles']);
      const limit = limitParam ?? 20;

      // Bridge to plugin for the main search (variables, styles, local components, instance discovery)
      // When REST API is available for library components, tell plugin to skip remote components
      // to avoid mixing components from unrelated libraries.
      let restAvailable = false;
      if (types.has('components') && bridge.selectedLibrary !== '__local__') {
        try {
          const token = await getToken();
          const selectedFileKey = bridge.selectedLibrary
            ? bridge.getLibraryFileKey(bridge.selectedLibrary)
            : bridge.getFirstLibraryFileKey();
          restAvailable = !!token && !!selectedFileKey;
        } catch {
          /* no token */
        }
      }

      let pluginResult: Record<string, unknown> | null = null;
      try {
        pluginResult = (await bridge.request('search_design_system', {
          query: queryTrimmed,
          types: [...types],
          limit,
          selectedLibrary: bridge.selectedLibrary,
          skipRemoteComponents: restAvailable,
        })) as Record<string, unknown>;
      } catch (err) {
        console.warn('[FigCraft] search_design_system plugin bridge failed:', err);
      }

      // Supplement: search library components via REST API if we have a fileKey.
      // Plugin can only discover components from existing instances on the page.
      // REST API can enumerate ALL published components in the library file.
      // This works even when plugin bridge is down (offline-capable).
      // Skip REST supplement in local-only mode — no library to search.
      if (types.has('components') && bridge.selectedLibrary !== '__local__') {
        try {
          const token = await getToken();
          if (token) {
            // Get library fileKey for the selected library.
            // Prefer exact match for selected library, fall back to first available.
            const fileKey = bridge.selectedLibrary
              ? bridge.getLibraryFileKey(bridge.selectedLibrary)
              : bridge.getFirstLibraryFileKey();
            if (fileKey) {
              const queryTokens = queryTrimmed.toLowerCase().split(/\s+/).filter(Boolean);
              // Reuse cached REST result from get_mode if available (60s TTL)
              let grouped = bridge.getRestComponentCache(fileKey) as ReturnType<typeof groupComponentsBySet> | null;
              if (!grouped) {
                const [components, componentSets] = await Promise.all([
                  fetchLibraryComponents(fileKey, token),
                  fetchLibraryComponentSets(fileKey, token),
                ]);
                grouped = groupComponentsBySet(components, componentSets);
                bridge.setRestComponentCache(fileKey, grouped);
              }

              // Collect keys already found by plugin to avoid duplicates
              const pluginComponentKeys = new Set<string>();
              if (pluginResult?.components && Array.isArray(pluginResult.components)) {
                for (const c of pluginResult.components as Array<{ key?: string }>) {
                  if (c.key) pluginComponentKeys.add(c.key);
                }
              }

              // Score REST-sourced components
              const restComponents: Array<Record<string, unknown> & { _score: number }> = [];

              for (const cs of (grouped.componentSets || []) as Array<{
                name: string;
                key: string;
                description?: string;
                containingFrame?: string;
                variants: Array<{ name: string; properties: Record<string, string> }>;
              }>) {
                if (pluginComponentKeys.has(cs.key)) continue;
                const score = scoreMatchWithContext(
                  cs.name,
                  cs.description || '',
                  cs.containingFrame || '',
                  queryTokens,
                );
                if (score > 0) {
                  // Extract propertyOptions from variants so AI can instantiate
                  // without an extra list_properties round-trip
                  const propertyOptions: Record<string, string[]> = {};
                  for (const v of cs.variants) {
                    for (const [prop, val] of Object.entries(v.properties)) {
                      if (!propertyOptions[prop]) propertyOptions[prop] = [];
                      if (!propertyOptions[prop].includes(val)) propertyOptions[prop].push(val);
                    }
                  }
                  restComponents.push({
                    key: cs.key,
                    name: cs.name,
                    description: cs.description || '',
                    containingFrame: cs.containingFrame || '',
                    isSet: true,
                    libraryName: '(library)',
                    variantCount: cs.variants.length,
                    propertyOptions,
                    _score: score,
                  });
                }
              }

              for (const c of (grouped.standalone || []) as Array<{
                name: string;
                key: string;
                description?: string;
                containingFrame?: string;
              }>) {
                if (pluginComponentKeys.has(c.key)) continue;
                const score = scoreMatchWithContext(c.name, c.description || '', c.containingFrame || '', queryTokens);
                if (score > 0) {
                  restComponents.push({
                    key: c.key,
                    name: c.name,
                    description: c.description || '',
                    containingFrame: c.containingFrame || '',
                    isSet: false,
                    libraryName: '(library)',
                    _score: score,
                  });
                }
              }

              // Merge REST components into plugin result, re-sort by score.
              // REST results come from the selected library (via fileKey), so they should
              // take priority over plugin-discovered components which may come from any library.
              if (restComponents.length > 0) {
                const cleaned = restComponents
                  .sort((a, b) => b._score - a._score)
                  .slice(0, limit)
                  .map(({ _score, ...rest }) => rest);

                // Build a set of REST keys (selected library) for dedup + priority
                const restKeys = new Set(cleaned.map((c) => c.key as string));

                if (pluginResult) {
                  // Partition plugin results: local components stay, remote duplicates removed
                  const existing = ((pluginResult.components as Array<Record<string, unknown>>) || []).filter(
                    (c) => !restKeys.has(c.key as string),
                  );
                  // REST results (selected library) first, then plugin-discovered (local + other libraries)
                  pluginResult.components = [...cleaned, ...existing].slice(0, limit);
                  if (pluginResult.summary && typeof pluginResult.summary === 'object') {
                    (pluginResult.summary as Record<string, number>).components = (
                      pluginResult.components as unknown[]
                    ).length;
                  }
                } else {
                  // Plugin bridge failed — return REST-only results
                  pluginResult = {
                    query: queryTrimmed,
                    components: cleaned.slice(0, limit),
                    variables: [],
                    styles: [],
                    summary: { components: cleaned.length, variables: 0, styles: 0 },
                    _partial: true,
                  };
                }
              }
            }
          }
        } catch (err) {
          // REST supplement is best-effort — don't fail the whole search
          console.warn('[FigCraft] search_design_system REST component search failed:', err);
        }
      }

      // If both plugin bridge and REST failed, return empty
      if (!pluginResult) {
        return compactResponse({
          query: queryTrimmed,
          error: 'Plugin not connected and no library fileKey cached. Call get_mode first to establish context.',
          components: [],
          variables: [],
          styles: [],
          summary: { components: 0, variables: 0, styles: 0 },
          _searchScope: 'none',
        });
      }

      // Add search scope indicator to help AI understand result completeness
      const hasPlugin = !pluginResult._partial;
      const scope = restAvailable ? (hasPlugin ? 'local+library' : 'library-only') : hasPlugin ? 'local-only' : 'none';
      pluginResult._searchScope = scope;
      if (scope === 'local-only') {
        pluginResult._searchScopeNote =
          'Components searched from current page only. Configure FIGMA_API_TOKEN to search all published library components.';
      }

      return compactResponse(pluginResult);
    },
  );
}
