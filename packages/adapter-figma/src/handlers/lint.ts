/**
 * Lint handlers — check, fix, rules, annotations.
 *
 * Linter runs entirely in Plugin side (review correction #2).
 */

import { registerHandler } from '../registry.js';
import { simplifyNode } from '../adapters/node-simplifier.js';
import { runLint, getAvailableRules } from '@figcraft/quality-engine';
import { findNodeByIdAsync } from '../utils/node-lookup.js';
import type { AbstractNode, LintContext, LintViolation, LintCategory as LintRuleCategory, LintReport } from '@figcraft/quality-engine';
import type { CompressedNode } from '@figcraft/shared';
import { STORAGE_KEYS } from '../constants.js';
import { hexToFigmaRgb, figmaRgbaToHex } from '../utils/color.js';
import { ensureLoaded, getTextStyleId } from '../utils/style-registry.js';
import { isVariableAlias, isRgbaLike, setSpacingProp } from '../utils/type-guards.js';

// Cache last-built LintContext Maps to avoid redundant Map construction on repeated calls
// with the same tokenContext (common in iterative lint workflows).
let _cachedTokenContextKey: string | null = null;
let _cachedTokenMaps: Pick<LintContext, 'colorTokens' | 'spacingTokens' | 'radiusTokens' | 'typographyTokens' | 'variableIds'> | null = null;

export function registerLintHandlers(): void {

registerHandler('lint_check', async (params) => {
  const nodeIds = params.nodeIds as string[] | undefined;
  const rules = params.rules as string[] | undefined;
  const categories = params.categories as string[] | undefined;
  const offset = params.offset as number | undefined;
  const limit = params.limit as number | undefined;
  const maxViolations = params.maxViolations as number | undefined;
  const annotate = params.annotate as boolean | undefined;
  const minSeverity = params.minSeverity as 'error' | 'warning' | 'info' | 'hint' | undefined;

  // Token context (passed from MCP Server or loaded from cache)
  const tokenContext = params.tokenContext as {
    colorTokens?: Record<string, string>;
    spacingTokens?: Record<string, number>;
    radiusTokens?: Record<string, number>;
    typographyTokens?: Record<string, { fontSize?: number; fontFamily?: string; fontWeight?: string }>;
    variableIds?: Record<string, string>;
  } | undefined;

  // Read current mode and selected library from storage
  const currentMode = ((await figma.clientStorage.getAsync(STORAGE_KEYS.MODE)) || 'library') as 'library' | 'spec';
  const currentLibrary = (await figma.clientStorage.getAsync(STORAGE_KEYS.LIBRARY)) as string | undefined;

  // Build lint context — cache Maps when tokenContext is unchanged (common in iterative workflows)
  const tokenContextKey = tokenContext ? JSON.stringify(tokenContext) : null;
  if (tokenContextKey !== _cachedTokenContextKey || _cachedTokenMaps === null) {
    _cachedTokenContextKey = tokenContextKey;
    _cachedTokenMaps = {
      colorTokens: new Map(Object.entries(tokenContext?.colorTokens ?? {})),
      spacingTokens: new Map(Object.entries(tokenContext?.spacingTokens ?? {})),
      radiusTokens: new Map(Object.entries(tokenContext?.radiusTokens ?? {})),
      typographyTokens: new Map(Object.entries(tokenContext?.typographyTokens ?? {})),
      variableIds: new Map(Object.entries(tokenContext?.variableIds ?? {})),
    };
  }
  const ctx: LintContext = {
    ..._cachedTokenMaps,
    mode: currentMode,
    selectedLibrary: currentLibrary || null,
  };

  // Collect nodes to lint
  let targetNodes: SceneNode[];
  let scope: { type: 'selection' | 'page'; count: number; names?: string[] };
  if (nodeIds && nodeIds.length > 0) {
    const resolved = await Promise.all(nodeIds.map((id) => findNodeByIdAsync(id)));
    targetNodes = resolved
      .filter((n): n is SceneNode => n !== null && 'type' in n && n.type !== 'PAGE' && n.type !== 'DOCUMENT');
    scope = { type: 'selection', count: targetNodes.length, names: targetNodes.slice(0, 5).map((n) => n.name) };
  } else {
    // Use selection, or fall back to current page children
    const selection = figma.currentPage.selection;
    if (selection.length > 0) {
      targetNodes = [...selection];
      scope = { type: 'selection', count: targetNodes.length, names: targetNodes.slice(0, 5).map((n) => n.name) };
    } else {
      targetNodes = [...figma.currentPage.children];
      scope = { type: 'page', count: targetNodes.length };
    }
  }

  // Cap top-level nodes to prevent oversized payloads on huge pages
  const MAX_TOP_NODES = 200;
  let truncatedNodes = false;
  if (targetNodes.length > MAX_TOP_NODES) {
    targetNodes = targetNodes.slice(0, MAX_TOP_NODES);
    truncatedNodes = true;
  }

  // Convert to abstract nodes
  const abstractNodes = targetNodes.map((n) => compressedToAbstract(simplifyNode(n)));

  // Run lint
  const report = runLint(abstractNodes, ctx, { rules, categories: categories as LintRuleCategory[] | undefined, offset, limit, maxViolations, minSeverity });

  // Annotate if requested
  if (annotate) {
    await annotateViolations(report);
  }

  return { ...report, scope: { ...scope, pageName: figma.currentPage.name, truncated: truncatedNodes } };
});

registerHandler('lint_fix', async (params) => {
  const violations = params.violations as LintViolation[];

  let fixed = 0;
  let failed = 0;
  const errors: Array<{ nodeId: string; error: string }> = [];

  for (const v of violations) {
    if (!v.autoFixable || !v.fixData) continue;

    try {
      const node = await findNodeByIdAsync(v.nodeId);
      if (!node) { failed++; errors.push({ nodeId: v.nodeId, error: 'Node not found' }); continue; }

      switch (v.rule) {
        case 'spec-color': {
          const variableId = v.fixData.variableId as string | undefined;
          if (variableId) {
            const variable = await figma.variables.getVariableByIdAsync(variableId);
            if (variable && 'fills' in node) {
              const prop = v.fixData.property as string;
              const geom = node as GeometryMixin;
              if (prop === 'fills') {
                const rawFills = geom.fills;
                if (rawFills === figma.mixed) break;
                const fills = [...rawFills] as Paint[];
                if (fills.length > 0 && fills[0].type === 'SOLID') {
                  fills[0] = figma.variables.setBoundVariableForPaint(
                    fills[0] as SolidPaint,
                    'color',
                    variable,
                  );
                  geom.fills = fills;
                }
              } else if (prop === 'strokes') {
                const strokes = [...geom.strokes] as Paint[];
                if (strokes.length > 0 && strokes[0].type === 'SOLID') {
                  strokes[0] = figma.variables.setBoundVariableForPaint(
                    strokes[0] as SolidPaint,
                    'color',
                    variable,
                  );
                  geom.strokes = strokes;
                }
              }
              fixed++;
            } else {
              failed++;
              errors.push({ nodeId: v.nodeId, error: 'Variable not found' });
            }
          }
          break;
        }
        case 'spec-border-radius': {
          const value = v.fixData.value as number;
          if ('cornerRadius' in node) {
            (node as RectangleNode).cornerRadius = value;
            fixed++;
          }
          break;
        }
        case 'spec-spacing': {
          const prop = v.fixData.property as string;
          const value = v.fixData.value as number;
          if (setSpacingProp(node, prop, value)) {
            fixed++;
          }
          break;
        }
        case 'wcag-text-size': {
          const fontSize = v.fixData.fontSize as number;
          if ('fontSize' in node) {
            (node as TextNode).fontSize = fontSize;
            fixed++;
          }
          break;
        }
        case 'hardcoded-token': {
          const prop = v.fixData.property as string;

          if (prop === 'cornerRadius' && 'cornerRadius' in node) {
            const targetValue = v.fixData.value as number;
            const nodeName = (v.fixData.nodeName as string | undefined) || v.nodeName || '';
            const libraryName = (await figma.clientStorage.getAsync(STORAGE_KEYS.LIBRARY)) as string | undefined;
            if (!libraryName) { failed++; errors.push({ nodeId: v.nodeId, error: 'No library selected' }); break; }

            // Collect all candidate radius variables with their resolved values
            interface RadiusCandidate { variable: Variable; value: number; dist: number }
            const candidates: RadiusCandidate[] = [];

            const resolveValue = async (variable: Variable): Promise<number | null> => {
              const modeIds = Object.keys(variable.valuesByMode);
              if (modeIds.length === 0) return null;
              let val = variable.valuesByMode[modeIds[0]];
              // Resolve alias
              if (isVariableAlias(val)) {
                try {
                  const resolved = await figma.variables.getVariableByIdAsync(val.id);
                  if (resolved) {
                    const resModes = Object.keys(resolved.valuesByMode);
                    if (resModes.length > 0) val = resolved.valuesByMode[resModes[0]];
                  }
                } catch { /* skip */ }
              }
              return typeof val === 'number' ? val : null;
            };

            if (libraryName === '__local__') {
              const localCollections = await figma.variables.getLocalVariableCollectionsAsync();
              for (const col of localCollections) {
                for (const varId of col.variableIds) {
                  const variable = await figma.variables.getVariableByIdAsync(varId);
                  if (!variable || variable.resolvedType !== 'FLOAT') continue;
                  const scopes = variable.scopes;
                  if (scopes.length > 0 && !scopes.includes('CORNER_RADIUS') && !scopes.includes('ALL_SCOPES')) continue;
                  const val = await resolveValue(variable);
                  if (val === null) continue;
                  candidates.push({ variable, value: val, dist: Math.abs(val - targetValue) });
                }
              }
            } else {
              const collections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
              const radiusCols = collections.filter((c) => {
                const n = c.name.toLowerCase();
                return n.includes('round') || n.includes('radius') || n.includes('corner') || n.includes('border');
              });
              const searchCols = radiusCols.length > 0 ? radiusCols : collections;
              for (const col of searchCols) {
                const libVars = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(col.key);
                for (const lv of libVars) {
                  if (lv.resolvedType !== 'FLOAT') continue;
                  try {
                    const imported = await figma.variables.importVariableByKeyAsync(lv.key);
                    const val = await resolveValue(imported);
                    if (val === null) continue;
                    candidates.push({ variable: imported, value: val, dist: Math.abs(val - targetValue) });
                  } catch { /* skip */ }
                }
              }
            }

            // Semantic matching: extract keywords from node name, match against variable name
            const RADIUS_TOLERANCE = 4;
            const eligible = candidates.filter((c) => c.dist <= RADIUS_TOLERANCE);

            let picked: RadiusCandidate | null = null;
            if (eligible.length > 0) {
              // Extract keywords from node name for semantic matching
              // e.g. "Button / Primary" → ["button", "primary"]
              const nodeKeywords = nodeName.toLowerCase().split(/[\s\/\-_|]+/).filter((w) => w.length > 1);

              // Score each candidate: count how many node keywords appear in variable name
              let bestScore = -1;
              let bestDist = Infinity;
              for (const c of eligible) {
                const varNameLower = c.variable.name.toLowerCase();
                let score = 0;
                for (const kw of nodeKeywords) {
                  if (varNameLower.includes(kw)) score++;
                }
                // Pick by: highest semantic score first, then smallest distance
                if (score > bestScore || (score === bestScore && c.dist < bestDist)) {
                  bestScore = score;
                  bestDist = c.dist;
                  picked = c;
                }
              }
            }

            if (picked) {
              if (picked.dist > 0) {
                (node as RectangleNode).cornerRadius = picked.value;
              }
              (node as SceneNode).setBoundVariable('cornerRadius' as VariableBindableNodeField, picked.variable);
              fixed++;
            } else {
              const closest = candidates.length > 0 ? candidates.reduce((a, b) => a.dist < b.dist ? a : b) : null;
              failed++;
              errors.push({ nodeId: v.nodeId, error: closest ? `No close radius match in library (closest differs by ${closest.dist}px)` : 'No radius variables found in library' });
            }
            break;
          }

          const hex = v.fixData.hex as string | null;
          const nodeType = v.fixData.nodeType as string | undefined;
          const targetOpacity = (v.fixData.opacity as number | undefined) ?? 1;
          if (prop === 'fills' && hex && 'fills' in node) {
            // Load library color variables and find the closest match
            const libraryName = (await figma.clientStorage.getAsync(STORAGE_KEYS.LIBRARY)) as string | undefined;
            if (libraryName) {
              const targetRgb = hexToFigmaRgb(hex);
              const isTextNode = nodeType === 'TEXT' || node.type === 'TEXT';
              let bestVar: Variable | null = null;
              let bestDist = Infinity;
              // For text nodes, also track the best text-scoped variable separately
              let bestTextVar: Variable | null = null;
              let bestTextDist = Infinity;
              let bestTextIsPrimary = false;

              const evaluateVariable = (variable: Variable, c: RGBA | RGB) => {
                const a = 'a' in c ? c.a : 1;
                // RGBA distance — include alpha channel to distinguish e.g. text/primary (100%) vs text/secondary (60%)
                const dist = (c.r - targetRgb.r) ** 2 + (c.g - targetRgb.g) ** 2 + (c.b - targetRgb.b) ** 2 + (a - targetOpacity) ** 2;
                if (dist < bestDist) { bestDist = dist; bestVar = variable; }
                // For text nodes, prefer text-scoped variables
                if (isTextNode) {
                  const name = variable.name.toLowerCase();
                  if (name.includes('text')) {
                    const isPrimary = name.includes('primary') || name.endsWith('text/default') || name.endsWith('/900');
                    // Pick this text variable if: closer distance, OR same distance but this one is "primary"
                    if (dist < bestTextDist || (dist === bestTextDist && isPrimary && !bestTextIsPrimary)) {
                      bestTextDist = dist;
                      bestTextVar = variable;
                      bestTextIsPrimary = isPrimary;
                    }
                  }
                }
              };

              if (libraryName === '__local__') {
                // Local file: scan local color variables
                const localCollections = await figma.variables.getLocalVariableCollectionsAsync();
                for (const col of localCollections) {
                  for (const varId of col.variableIds) {
                    const variable = await figma.variables.getVariableByIdAsync(varId);
                    if (!variable || variable.resolvedType !== 'COLOR') continue;
                    const modeId = col.modes[0]?.modeId;
                    if (!modeId) continue;
                    const val = variable.valuesByMode[modeId];
                    if (!val || !isRgbaLike(val)) continue;
                    evaluateVariable(variable, val);
                  }
                }
              } else {
                // Team library: load color collection variables
                const collections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
                const colorCols = collections.filter((c) =>
                  c.name.toLowerCase().includes('color') || c.name.toLowerCase().includes('primitives'),
                );
                // For text nodes, prioritize semantic collections (non-primitives) over primitives
                if (isTextNode) {
                  colorCols.sort((a, b) => {
                    const aIsPrim = a.name.toLowerCase().includes('primitives') ? 1 : 0;
                    const bIsPrim = b.name.toLowerCase().includes('primitives') ? 1 : 0;
                    return aIsPrim - bIsPrim;
                  });
                }
                for (const col of colorCols) {
                  const libVars = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(col.key);
                  for (const lv of libVars) {
                    if (lv.resolvedType !== 'COLOR') continue;
                    try {
                      const imported = await figma.variables.importVariableByKeyAsync(lv.key);
                      const modeIds = Object.keys(imported.valuesByMode);
                      if (modeIds.length === 0) continue;
                      const val = imported.valuesByMode[modeIds[0]];
                      let c: RGBA | null = null;
                      if (isRgbaLike(val)) {
                        c = val;
                      } else if (isVariableAlias(val)) {
                        // Resolve alias to get actual RGBA value
                        try {
                          const aliasId = val.id;
                          let resolved = await figma.variables.getVariableByIdAsync(aliasId);
                          // If local lookup fails, the alias target may not be imported yet
                          if (!resolved) {
                            try { resolved = await figma.variables.importVariableByKeyAsync(aliasId); } catch { /* skip */ }
                          }
                          if (resolved) {
                            const resModes = Object.keys(resolved.valuesByMode);
                            for (const rm of resModes) {
                              const resVal = resolved.valuesByMode[rm];
                              if (isRgbaLike(resVal)) {
                                c = resVal;
                                break;
                              }
                              // Handle nested alias (one more level)
                              if (isVariableAlias(resVal)) {
                                try {
                                  const deepId = resVal.id;
                                  let deep = await figma.variables.getVariableByIdAsync(deepId);
                                  if (!deep) { try { deep = await figma.variables.importVariableByKeyAsync(deepId); } catch { /* skip */ } }
                                  if (deep) {
                                    const deepModes = Object.keys(deep.valuesByMode);
                                    if (deepModes.length > 0) {
                                      const dv = deep.valuesByMode[deepModes[0]];
                                      if (isRgbaLike(dv)) { c = dv; break; }
                                    }
                                  }
                                } catch { /* skip */ }
                              }
                            }
                          }
                        } catch { /* skip unresolvable alias */ }
                      }
                      if (!c) continue;
                      evaluateVariable(imported, c);
                    } catch { /* skip unresolvable */ }
                  }
                }
              }

              // For text nodes, prefer text-scoped variable if found with close enough match
              const finalVar = (isTextNode && bestTextVar && bestTextDist < 0.01) ? bestTextVar : bestVar;
              const finalDist = (isTextNode && bestTextVar && bestTextDist < 0.01) ? bestTextDist : bestDist;

              // Only bind if we found a close enough match (distance < 0.01 ≈ ~4 RGB units)
              if (finalVar && finalDist < 0.01) {
                const geom = node as GeometryMixin;
                const rawFills = geom.fills;
                if (rawFills === figma.mixed) {
                  failed++;
                  errors.push({ nodeId: v.nodeId, error: 'Mixed fills' });
                } else {
                  const fills = [...rawFills] as Paint[];
                  if (fills.length > 0 && fills[0].type === 'SOLID') {
                    fills[0] = figma.variables.setBoundVariableForPaint(fills[0] as SolidPaint, 'color', finalVar);
                    geom.fills = fills;
                    fixed++;
                  } else {
                    failed++;
                    errors.push({ nodeId: v.nodeId, error: 'No solid fill to bind' });
                  }
                }
              } else {
                failed++;
                errors.push({ nodeId: v.nodeId, error: finalVar ? 'No close color match in library' : 'No color variables found' });
              }
            } else {
              failed++;
              errors.push({ nodeId: v.nodeId, error: 'No library selected' });
            }
          } else {
            failed++;
            errors.push({ nodeId: v.nodeId, error: 'Unsupported hardcoded-token fix property' });
          }
          break;
        }
        case 'wcag-line-height': {
          const lineHeight = v.fixData.lineHeight as number;
          if ('lineHeight' in node) {
            (node as TextNode).lineHeight = { value: lineHeight, unit: 'PIXELS' };
            fixed++;
          } else {
            failed++;
            errors.push({ nodeId: v.nodeId, error: 'Node has no lineHeight property' });
          }
          break;
        }
        case 'no-text-style': {
          // Try to find and apply a matching text style from the library
          const targetSize = v.fixData.fontSize as number | undefined;
          if (!targetSize || node.type !== 'TEXT') {
            failed++;
            errors.push({ nodeId: v.nodeId, error: 'Missing fontSize or not a text node' });
            break;
          }
          const libraryName = (await figma.clientStorage.getAsync(STORAGE_KEYS.LIBRARY)) as string | undefined;
          if (!libraryName) {
            failed++;
            errors.push({ nodeId: v.nodeId, error: 'No library selected' });
            break;
          }

          let bestStyle: TextStyle | null = null;
          let bestSizeDist = Infinity;

          if (libraryName === '__local__') {
            const localStyles = await figma.getLocalTextStylesAsync();
            for (const style of localStyles) {
              const dist = Math.abs(style.fontSize - targetSize);
              if (dist < bestSizeDist) { bestSizeDist = dist; bestStyle = style; }
            }
          } else {
            // Use style registry (populated via register_library_styles / sync_library_styles)
            await ensureLoaded(libraryName);
            const match = getTextStyleId(targetSize);
            if (match) {
              bestSizeDist = 0;
              const style = figma.getStyleById(match.id);
              if (style && style.type === 'TEXT') bestStyle = style as TextStyle;
            }
          }

          // Only apply if we found a reasonably close match (within 4px)
          if (bestStyle && bestSizeDist <= 4) {
            (node as TextNode).textStyleId = bestStyle.id;
            fixed++;
          } else {
            failed++;
            errors.push({ nodeId: v.nodeId, error: bestStyle ? `Closest text style differs by ${bestSizeDist}px` : 'No text styles found — run sync_library_styles first' });
          }
          break;
        }
        case 'button-structure': {
          // Auto-fix: multiple fix types based on fixData.fix
          if (node.type === 'FRAME' || node.type === 'COMPONENT') {
            const frame = node as FrameNode;
            const fixType = v.fixData?.fix as string | undefined;

            if (fixType === 'layout' || (!fixType && v.fixData?.layoutMode)) {
              // Legacy + new: set auto-layout with centered alignment
              if (v.fixData?.layoutMode) frame.layoutMode = v.fixData.layoutMode as 'HORIZONTAL' | 'VERTICAL';
              if (v.fixData?.primaryAxisAlignItems) (frame as any).primaryAxisAlignItems = v.fixData.primaryAxisAlignItems;
              if (v.fixData?.counterAxisAlignItems) (frame as any).counterAxisAlignItems = v.fixData.counterAxisAlignItems;
              fixed++;
            } else if (fixType === 'padding') {
              if (v.fixData?.paddingLeft != null) frame.paddingLeft = v.fixData.paddingLeft as number;
              if (v.fixData?.paddingRight != null) frame.paddingRight = v.fixData.paddingRight as number;
              fixed++;
            } else if (fixType === 'height') {
              const targetHeight = v.fixData?.height as number ?? 48;
              if (frame.height < targetHeight) {
                frame.resize(frame.width, targetHeight);
                // Also set minHeight so auto-layout doesn't shrink it
                if ('minHeight' in frame) frame.minHeight = targetHeight;
              }
              fixed++;
            } else {
              failed++;
              errors.push({ nodeId: v.nodeId, error: `Unknown button-structure fix type: ${fixType}` });
            }
          } else {
            failed++;
            errors.push({ nodeId: v.nodeId, error: 'Node is not a frame — cannot auto-fix button structure' });
          }
          break;
        }
        case 'text-overflow': {
          // Auto-fix: set textAutoResize to WIDTH_AND_HEIGHT
          if (node.type === 'TEXT') {
            const textNode = node as TextNode;
            if (textNode.fontName !== figma.mixed) {
              await figma.loadFontAsync(textNode.fontName);
            }
            textNode.textAutoResize = (v.fixData?.textAutoResize as TextNode['textAutoResize']) ?? 'WIDTH_AND_HEIGHT';
            fixed++;
          } else {
            failed++;
            errors.push({ nodeId: v.nodeId, error: 'Node is not a text node — cannot fix text overflow' });
          }
          break;
        }
        case 'form-consistency': {
          // Auto-fix: set layoutAlign=STRETCH on children that are narrower than siblings
          if ('layoutAlign' in node) {
            (node as SceneNode & { layoutAlign: string }).layoutAlign = v.fixData?.layoutAlign as string ?? 'STRETCH';
            fixed++;
          } else {
            failed++;
            errors.push({ nodeId: v.nodeId, error: 'Node does not support layoutAlign' });
          }
          break;
        }
        case 'cta-width-inconsistent': {
          if ('layoutAlign' in node) {
            (node as SceneNode & { layoutAlign: string }).layoutAlign = v.fixData?.layoutAlign as string ?? 'STRETCH';
            fixed++;
          } else {
            failed++;
            errors.push({ nodeId: v.nodeId, error: 'Node does not support layoutAlign' });
          }
          break;
        }
        case 'overflow-parent': {
          // Auto-fix: set layoutAlign=STRETCH so child fills parent cross-axis
          if (v.fixData?.fix === 'stretch' && 'layoutAlign' in node) {
            (node as SceneNode & { layoutAlign: string }).layoutAlign = v.fixData.layoutAlign as string ?? 'STRETCH';
            fixed++;
          } else {
            failed++;
            errors.push({ nodeId: v.nodeId, error: 'Node does not support layoutAlign' });
          }
          break;
        }
        case 'section-spacing-collapse': {
          if ((node.type === 'FRAME' || node.type === 'COMPONENT') && typeof v.fixData?.itemSpacing === 'number') {
            (node as FrameNode).itemSpacing = v.fixData.itemSpacing as number;
            fixed++;
          } else {
            failed++;
            errors.push({ nodeId: v.nodeId, error: 'Node does not support itemSpacing' });
          }
          break;
        }
        case 'unbounded-hug': {
          // Auto-fix: set layoutAlign=STRETCH on the frame itself so it fills parent cross-axis
          if (v.fixData?.fix === 'stretch-self' && 'layoutAlign' in node) {
            (node as SceneNode & { layoutAlign: string }).layoutAlign = v.fixData.layoutAlign as string ?? 'STRETCH';
            fixed++;
          } else {
            failed++;
            errors.push({ nodeId: v.nodeId, error: v.fixData?.fix ? 'Node does not support layoutAlign' : 'No auto-fix available for this violation' });
          }
          break;
        }
        case 'no-autolayout': {
          // Auto-fix: enable auto-layout with inferred direction
          if (node.type === 'FRAME' || node.type === 'COMPONENT') {
            const frame = node as FrameNode;
            frame.layoutMode = (v.fixData?.layoutMode as 'HORIZONTAL' | 'VERTICAL') ?? 'VERTICAL';
            fixed++;
          } else {
            failed++;
            errors.push({ nodeId: v.nodeId, error: 'Node is not a frame — cannot enable auto-layout' });
          }
          break;
        }
        default:
          failed++;
          errors.push({ nodeId: v.nodeId, error: `No fix for rule ${v.rule}` });
      }
    } catch (err) {
      failed++;
      errors.push({
        nodeId: v.nodeId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { fixed, failed, errors };
});

registerHandler('lint_rules', async () => {
  return { rules: getAvailableRules() };
});

registerHandler('clear_annotations', async (params) => {
  const nodeIds = params.nodeIds as string[] | undefined;
  const targets = nodeIds
    ? (await Promise.all(nodeIds.map((id) => findNodeByIdAsync(id)))).filter(Boolean) as SceneNode[]
    : [...figma.currentPage.children];

  const MAX_DEPTH = 10;
  let cleared = 0;
  function walk(node: SceneNode, depth = 0) {
    if (depth > MAX_DEPTH) return;
    if ('annotations' in node) {
      const annotated = node as SceneNode & { annotations: unknown[] };
      if (annotated.annotations.length > 0) {
        annotated.annotations = [];
        cleared++;
      }
    }
    if ('children' in node) {
      for (const child of (node as ChildrenMixin).children) {
        walk(child, depth + 1);
      }
    }
  }
  targets.forEach((n) => walk(n));

  return { cleared };
});

} // registerLintHandlers

// ─── Helpers ───

function compressedToAbstract(node: CompressedNode): AbstractNode {
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    role: node.role,
    fills: node.fills as AbstractNode['fills'],
    strokes: node.strokes as AbstractNode['strokes'],
    cornerRadius: node.cornerRadius,
    fontSize: node.fontSize,
    fontName: node.fontName as AbstractNode['fontName'],
    lineHeight: node.lineHeight,
    letterSpacing: node.letterSpacing,
    opacity: node.opacity,
    width: node.width,
    height: node.height,
    layoutMode: node.layoutMode,
    layoutPositioning: node.layoutPositioning,
    itemSpacing: node.itemSpacing,
    paddingLeft: node.paddingLeft,
    paddingRight: node.paddingRight,
    paddingTop: node.paddingTop,
    paddingBottom: node.paddingBottom,
    primaryAxisAlignItems: node.primaryAxisAlignItems,
    counterAxisAlignItems: node.counterAxisAlignItems,
    clipsContent: node.clipsContent,
    strokeWeight: node.strokeWeight,
    layoutAlign: node.layoutAlign,
    x: node.x,
    y: node.y,
    characters: node.characters,
    textAutoResize: node.textAutoResize,
    boundVariables: node.boundVariables,
    fillStyleId: node.fillStyleId,
    textStyleId: node.textStyleId,
    effectStyleId: node.effectStyleId,
    componentPropertyDefinitions: node.componentPropertyDefinitions,
    componentPropertyReferences: node.componentPropertyReferences,
    children: node.children?.map(compressedToAbstract),
  };
}

async function annotateViolations(report: LintReport): Promise<void> {
  // Group violations by nodeId so each node gets a single merged annotation
  const grouped = new Map<string, string[]>();
  for (const category of report.categories) {
    for (const violation of category.nodes) {
      const list = grouped.get(violation.nodeId);
      if (list) {
        list.push(violation.suggestion);
      } else {
        grouped.set(violation.nodeId, [violation.suggestion]);
      }
    }
  }

  for (const [nodeId, suggestions] of grouped) {
    const node = await findNodeByIdAsync(nodeId);
    if (!node || !('annotations' in node)) continue;
    const annotated = node as SceneNode & {
      annotations: Array<{ label: string }>;
    };
    // Remove previous FigCraft annotations to avoid stacking on re-runs
    const kept = (annotated.annotations || []).filter(
      (a) => !a.label.startsWith('[FigCraft]') && !a.label.startsWith('[figcraft]'),
    );
    const label =
      suggestions.length === 1
        ? `[FigCraft] ${suggestions[0]}`
        : `[FigCraft] ${suggestions.map((s) => `• ${s}`).join(' | ')}`;
    annotated.annotations = [...kept, { label }];
  }
}
