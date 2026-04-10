/**
 * Node write handlers — shared utilities + patch, delete, clone, reparent.
 *
 * Creation handlers split into:
 *   write-nodes-create.ts   — create_frame, create_text
 *   write-nodes-instance.ts — create_instance, create_instances, misc creation
 */

import { PLUGIN_DATA_KEYS, STORAGE_KEYS } from '../constants.js';
import { registerHandler } from '../registry.js';
import { registerCache } from '../utils/cache-manager.js';
import { autoBindTypography } from '../utils/design-context.js';
import { assertHandler } from '../utils/handler-error.js';
import type { TokenBindingFailure } from '../utils/node-helpers.js';
import {
  applyCornerRadius,
  applyFill,
  applyStroke,
  applyTokenField,
  translateSingleSizing,
} from '../utils/node-helpers.js';
import { assertOnCurrentPage, findNodeByIdAsync, getContainingPage } from '../utils/node-lookup.js';
import { ensureLoaded, getTextStyleId } from '../utils/style-registry.js';

const MODE_STORAGE_KEY = STORAGE_KEYS.MODE;
const LIBRARY_STORAGE_KEY = STORAGE_KEYS.LIBRARY;

// ─── Font resolution with fuzzy matching ───

export interface FontResolution {
  fontName: FontName;
  /** null if exact match; otherwise describes what happened */
  fallbackNote: string | null;
}

let _fontCache: FontName[] | null = null;

async function getAvailableFonts(): Promise<FontName[]> {
  if (!_fontCache) {
    const raw = await figma.listAvailableFontsAsync();
    _fontCache = raw.map((f: { fontName: FontName }) => f.fontName);
  }
  return _fontCache;
}

export function clearFontCache(): void {
  _fontCache = null;
}

/** Strip a font style to lowercase letters/digits only for fuzzy comparison. */
function stripStyle(s: string): string {
  return s.toLowerCase().replace(/[\s\-_]/g, '');
}

/**
 * Resolve a font family + style with fuzzy matching.
 * Chain: exact → camelCase split → fuzzy strip → case-insensitive family → Inter fallback.
 */
export async function resolveFontAsync(family: string, style: string): Promise<FontResolution> {
  // 1. Exact match
  try {
    await figma.loadFontAsync({ family, style });
    return { fontName: { family, style }, fallbackNote: null };
  } catch {
    /* continue */
  }

  // 2. CamelCase split: "SemiBold" → "Semi Bold"
  const camelSplit = style.replace(/([a-z])([A-Z])/g, '$1 $2');
  if (camelSplit !== style) {
    try {
      await figma.loadFontAsync({ family, style: camelSplit });
      return { fontName: { family, style: camelSplit }, fallbackNote: `Resolved "${style}" → "${camelSplit}"` };
    } catch {
      /* continue */
    }
  }

  // 3. Fuzzy match against available fonts for this family
  const allFonts = await getAvailableFonts();
  const familyFonts = allFonts.filter((f) => f.family === family);
  if (familyFonts.length > 0) {
    const stripped = stripStyle(style);
    const match = familyFonts.find((f) => stripStyle(f.style) === stripped);
    if (match) {
      await figma.loadFontAsync(match);
      return { fontName: match, fallbackNote: `Resolved "${style}" → "${match.style}" (fuzzy)` };
    }
  }

  // 4. Case-insensitive family match ("inter" → "Inter")
  if (familyFonts.length === 0) {
    const looseFamilyFonts = allFonts.filter((f) => f.family.toLowerCase() === family.toLowerCase());
    if (looseFamilyFonts.length > 0) {
      const correctedFamily = looseFamilyFonts[0].family;
      // Retry exact + fuzzy with corrected family
      const stripped = stripStyle(style);
      const match =
        looseFamilyFonts.find((f) => stripStyle(f.style) === stripped) ??
        looseFamilyFonts.find((f) => f.style === style) ??
        looseFamilyFonts.find((f) => f.style === camelSplit);
      if (match) {
        await figma.loadFontAsync(match);
        return { fontName: match, fallbackNote: `Resolved "${family}" → "${correctedFamily}", style "${match.style}"` };
      }
      // Family found but no style match — try Regular
      const regular = looseFamilyFonts.find((f) => f.style === 'Regular');
      if (regular) {
        await figma.loadFontAsync(regular);
        const available = [...new Set(looseFamilyFonts.map((f) => f.style))];
        return {
          fontName: regular,
          fallbackNote: `"${correctedFamily}" style "${style}" not found → Regular. Available: [${available.join(', ')}]`,
        };
      }
    }
  }

  // 5. Family matched but style not found — fall back to Regular with hint
  if (familyFonts.length > 0) {
    const regular = familyFonts.find((f) => f.style === 'Regular');
    if (regular) {
      await figma.loadFontAsync(regular);
      const available = [...new Set(familyFonts.map((f) => f.style))];
      return {
        fontName: regular,
        fallbackNote: `"${family}" style "${style}" not found → Regular. Available: [${available.join(', ')}]`,
      };
    }
  }

  // Final fallback: Inter Regular
  const fallback: FontName = { family: 'Inter', style: 'Regular' };
  await figma.loadFontAsync(fallback);
  const available = familyFonts.length > 0 ? [...new Set(familyFonts.map((f) => f.style))] : [];
  const hint =
    available.length > 0
      ? `Font "${family}" style "${style}" not found → Inter Regular. Available styles for "${family}": [${available.join(', ')}]`
      : `Font "${family}" not available → Inter Regular`;
  return { fontName: fallback, fallbackNote: hint };
}

/** Legacy compat wrapper — returns just the FontName (no fallback note). */
export async function loadFontWithFallback(family: string, style: string): Promise<FontName> {
  const { fontName } = await resolveFontAsync(family, style);
  return fontName;
}

// ─── Mode/Library cache ───
let _cachedMode: string | null = null;
let _cachedLibrary: string | undefined;
let _cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000;

export async function getCachedModeLibrary(): Promise<[string, string | undefined]> {
  const now = Date.now();
  if (_cachedMode !== null && now - _cacheTimestamp < CACHE_TTL_MS) {
    return [_cachedMode, _cachedLibrary];
  }
  const [mode, library] = await Promise.all([
    figma.clientStorage.getAsync(MODE_STORAGE_KEY).then((v) => (v as string) || 'library'),
    figma.clientStorage.getAsync(LIBRARY_STORAGE_KEY) as Promise<string | undefined>,
  ]);
  _cachedMode = mode;
  _cachedLibrary = library;
  _cacheTimestamp = now;
  return [mode, library];
}

/** Invalidate the mode/library cache (called when library changes). */
export function invalidateModeCache(): void {
  _cachedMode = null;
  _cacheTimestamp = 0;
}

// Register with centralized cache manager
registerCache('mode-library', invalidateModeCache);
registerCache('font-cache', clearFontCache);

export function registerWriteNodeHandlers(): void {
  registerHandler('set_text_content', async (params) => {
    const nodeId = params.nodeId as string;
    const content = params.content as string;
    const node = await findNodeByIdAsync(nodeId);
    assertHandler(node && node.type === 'TEXT', `Text node not found: ${nodeId}`, 'NOT_FOUND');
    const text = node as TextNode;
    if (text.fontName !== figma.mixed) {
      await figma.loadFontAsync(text.fontName);
    }
    text.characters = content;
    return { ok: true };
  });

  registerHandler('set_text_range', async (params) => {
    const nodeId = params.nodeId as string;
    const operations = params.operations as Array<{
      type:
        | 'fontSize'
        | 'fontName'
        | 'fills'
        | 'insert'
        | 'delete'
        | 'letterSpacing'
        | 'lineHeight'
        | 'textDecoration'
        | 'textCase';
      start: number;
      end?: number;
      value: unknown;
    }>;

    const node = await findNodeByIdAsync(nodeId);
    assertHandler(node && node.type === 'TEXT', `Text node not found: ${nodeId}`, 'NOT_FOUND');
    const textNode = node as TextNode;

    // 1. Collect all required fonts and batch-preload
    const fontsToLoad = new Set<string>();
    if (textNode.fontName !== figma.mixed) {
      fontsToLoad.add(JSON.stringify(textNode.fontName));
    }
    for (const op of operations) {
      if (op.type === 'fontName') {
        const fn = op.value as { family: string; style: string };
        fontsToLoad.add(JSON.stringify({ family: fn.family, style: fn.style }));
      }
    }
    await Promise.all([...fontsToLoad].map((f) => figma.loadFontAsync(JSON.parse(f))));

    // 2. Apply operations sequentially
    const results: Array<{ index: number; ok: boolean; error?: string }> = [];
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      try {
        switch (op.type) {
          case 'fontSize':
            textNode.setRangeFontSize(op.start, op.end!, op.value as number);
            break;
          case 'fontName': {
            const fn = op.value as { family: string; style: string };
            textNode.setRangeFontName(op.start, op.end!, fn);
            break;
          }
          case 'fills':
            textNode.setRangeFills(op.start, op.end!, op.value as Paint[]);
            break;
          case 'insert':
            textNode.insertCharacters(op.start, op.value as string);
            break;
          case 'delete':
            textNode.deleteCharacters(op.start, op.end!);
            break;
          case 'letterSpacing':
            textNode.setRangeLetterSpacing(op.start, op.end!, op.value as LetterSpacing);
            break;
          case 'lineHeight':
            textNode.setRangeLineHeight(op.start, op.end!, op.value as LineHeight);
            break;
          case 'textDecoration':
            textNode.setRangeTextDecoration(op.start, op.end!, op.value as TextDecoration);
            break;
          case 'textCase':
            textNode.setRangeTextCase(op.start, op.end!, op.value as TextCase);
            break;
        }
        results.push({ index: i, ok: true });
      } catch (err) {
        results.push({ index: i, ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return { ok: results.every((r) => r.ok), characterCount: textNode.characters.length, results };
  });

  registerHandler('patch_nodes', async (params) => {
    const patches = params.patches as Array<{
      nodeId: string;
      props: Record<string, unknown>;
    }>;
    const [patchMode, patchLibrary] = await getCachedModeLibrary();
    if (patchMode === 'library' && patchLibrary) {
      await ensureLoaded(patchLibrary);
    }

    const DIRECT_PROPS: Record<string, string> = {
      visible: 'visible',
      opacity: 'opacity',
      itemSpacing: 'itemSpacing',
      strokeWeight: 'strokeWeight',
      strokeTopWeight: 'strokeTopWeight',
      strokeBottomWeight: 'strokeBottomWeight',
      strokeLeftWeight: 'strokeLeftWeight',
      strokeRightWeight: 'strokeRightWeight',
      layoutMode: 'layoutMode',
      layoutAlign: 'layoutAlign',
      layoutGrow: 'layoutGrow',
      primaryAxisAlignItems: 'primaryAxisAlignItems',
      counterAxisAlignItems: 'counterAxisAlignItems',
      paddingLeft: 'paddingLeft',
      paddingRight: 'paddingRight',
      paddingTop: 'paddingTop',
      paddingBottom: 'paddingBottom',
      rotation: 'rotation',
      blendMode: 'blendMode',
      isMask: 'isMask',
      clipsContent: 'clipsContent',
      minWidth: 'minWidth',
      minHeight: 'minHeight',
      maxWidth: 'maxWidth',
      maxHeight: 'maxHeight',
      counterAxisSpacing: 'counterAxisSpacing',
      gridRowCount: 'gridRowCount',
      gridColumnCount: 'gridColumnCount',
      gridRowGap: 'gridRowGap',
      gridColumnGap: 'gridColumnGap',
    };

    /** Text-specific direct props — require loadFont first, only valid on TEXT nodes. */
    const TEXT_DIRECT_PROPS: Record<string, string> = {
      textDecoration: 'textDecoration',
      textCase: 'textCase',
      textAlignHorizontal: 'textAlignHorizontal',
      textAlignVertical: 'textAlignVertical',
      textAutoResize: 'textAutoResize',
      paragraphSpacing: 'paragraphSpacing',
      paragraphIndent: 'paragraphIndent',
    };

    // ─── Known property sets for ordered dispatch ───
    const SIMPLE_KEYS = new Set([...Object.keys(DIRECT_PROPS), 'x', 'y', 'name', 'layoutPositioning']);
    const FILL_KEYS = new Set(['fills']);
    const STROKE_KEYS = new Set(['strokes']);
    const CORNER_KEYS = new Set(['cornerRadius']);
    const EFFECT_KEYS = new Set(['effects', 'constraints']);
    const LAYOUT_KEYS = new Set(['layoutSizingHorizontal', 'layoutSizingVertical']);
    const RESIZE_KEYS = new Set(['resize', 'width', 'height']);
    const TEXT_KEYS = new Set(['fontSize', 'fontName', ...Object.keys(TEXT_DIRECT_PROPS)]);
    const ALL_KNOWN = new Set([
      ...SIMPLE_KEYS,
      ...FILL_KEYS,
      ...STROKE_KEYS,
      ...CORNER_KEYS,
      ...EFFECT_KEYS,
      ...LAYOUT_KEYS,
      ...RESIZE_KEYS,
      ...TEXT_KEYS,
    ]);

    const tokenBindableFields = new Set([
      'itemSpacing',
      'paddingLeft',
      'paddingRight',
      'paddingTop',
      'paddingBottom',
      'strokeWeight',
      'strokeTopWeight',
      'strokeBottomWeight',
      'strokeLeftWeight',
      'strokeRightWeight',
    ]);

    const strict = params.strict as boolean | undefined;
    const results: Array<{
      nodeId: string;
      ok: boolean;
      error?: string;
      _unknownProps?: string[];
      _warnings?: string[];
      _tokenBindingFailures?: TokenBindingFailure[];
    }> = [];
    const resolvedNodes = await Promise.all(patches.map((p) => findNodeByIdAsync(p.nodeId)));

    for (let pi = 0; pi < patches.length; pi++) {
      const patch = patches[pi];
      try {
        const node = resolvedNodes[pi];
        if (!node) {
          results.push({ nodeId: patch.nodeId, ok: false, error: 'Node not found' });
          continue;
        }

        // Cross-page warning (non-blocking for patches)
        const patchPage = getContainingPage(node);
        if (patchPage && patchPage.id !== figma.currentPage.id) {
          console.warn(
            `[FigCraft] patch_nodes: node ${patch.nodeId} is on page "${patchPage.name}", not current page.`,
          );
        }

        // Collect unknown props upfront
        const unknownProps: string[] = [];
        for (const key of Object.keys(patch.props)) {
          if (!ALL_KNOWN.has(key)) unknownProps.push(key);
        }

        // Strict mode: reject patch if any unknown properties
        if (strict && unknownProps.length) {
          results.push({
            nodeId: patch.nodeId,
            ok: false,
            error: `Unknown properties: ${unknownProps.join(', ')}. Supported: ${[...ALL_KNOWN].sort().join(', ')}`,
            _unknownProps: unknownProps,
          });
          continue;
        }

        const props = patch.props;
        const useLib = patchMode === 'library' && !!patchLibrary;
        // Per-patch collectors for fill/stroke hints & failures, attached to the per-patch result.
        const patchWarnings: string[] = [];
        const patchBindingFailures: TokenBindingFailure[] = [];
        // ── Phase 1: Simple direct props (name, position, visibility, layout params) ──
        // layoutMode is applied here FIRST so subsequent phases see the correct mode.
        for (const key of Object.keys(props)) {
          if (!SIMPLE_KEYS.has(key)) continue;
          const value = props[key];

          if (key === 'x' || key === 'y') {
            (node as SceneNode)[key] = value as number;
          } else if (key === 'name') {
            node.name = value as string;
          } else if (key === 'layoutPositioning' && 'layoutPositioning' in node) {
            (node as any).layoutPositioning = value as string;
          } else if (key in DIRECT_PROPS && DIRECT_PROPS[key] in node) {
            if (useLib && tokenBindableFields.has(key) && typeof value === 'number') {
              await applyTokenField(node as SceneNode, DIRECT_PROPS[key], value, undefined, patchLibrary);
            } else {
              (node as any)[DIRECT_PROPS[key]] = value;
            }
          }
        }

        // ── Phase 2: Fill / Stroke / Corner / Effects ──
        if (props.fills != null && 'fills' in node) {
          const fillRole = node.type === 'TEXT' ? 'textColor' : 'background';
          const fr = await applyFill(
            node as SceneNode & MinimalFillsMixin,
            props.fills as any,
            fillRole,
            useLib,
            patchLibrary,
            { stylesPreloaded: true },
          );
          if (fr.colorHint) patchWarnings.push(fr.colorHint);
          if (fr.bindingFailure) patchBindingFailures.push(fr.bindingFailure);
        }
        if (props.strokes != null && 'strokes' in node) {
          const existingWeight = 'strokeWeight' in node ? ((node as any).strokeWeight as number) : undefined;
          const sr = await applyStroke(node as any, props.strokes as any, existingWeight, useLib, patchLibrary);
          if (sr.colorHint) patchWarnings.push(sr.colorHint);
          if (sr.bindingFailure) patchBindingFailures.push(sr.bindingFailure);
        }
        if (props.cornerRadius != null && 'cornerRadius' in node) {
          await applyCornerRadius(
            node as SceneNode,
            props.cornerRadius as number | number[] | string,
            useLib,
            undefined,
            patchLibrary,
          );
        }
        if (props.effects != null && 'effects' in node) {
          (node as BlendMixin).effects = props.effects as Effect[];
        }
        if (props.constraints != null && 'constraints' in node) {
          (node as ConstraintMixin).constraints = props.constraints as Constraints;
        }

        // ── Phase 3: Layout sizing (after layoutMode is applied in Phase 1) ──
        // layoutSizingHorizontal/Vertical describe how this node behaves in its PARENT's layout.
        // We need the PARENT's layoutMode to determine primary vs counter axis.
        for (const key of ['layoutSizingHorizontal', 'layoutSizingVertical'] as const) {
          if (props[key] == null) continue;
          const sizing = props[key] as 'FIXED' | 'HUG' | 'FILL';

          // Determine parent layout direction to resolve primary/counter axis
          const parent = node.parent;
          const parentDir = parent && 'layoutMode' in parent ? (parent as FrameNode).layoutMode : 'NONE';

          if (parentDir === 'NONE') {
            // No auto-layout parent — only self-sizing (HUG/FIXED) makes sense
            if ('layoutMode' in node && (node as FrameNode).layoutMode !== 'NONE') {
              const frameNode = node as FrameNode;
              const selfDir = frameNode.layoutMode;
              const selfIsHorizontal = selfDir === 'HORIZONTAL';
              const isSelfPrimary = (key === 'layoutSizingHorizontal') === selfIsHorizontal;
              const result = translateSingleSizing(
                sizing === 'FILL' ? 'HUG' : sizing,
                isSelfPrimary ? 'primary' : 'counter',
              );
              if (isSelfPrimary) {
                frameNode.primaryAxisSizingMode = result.mode;
              } else {
                frameNode.counterAxisSizingMode = result.mode;
              }
            }
            continue;
          }

          const parentIsHorizontal = parentDir === 'HORIZONTAL';
          const isPrimary = (key === 'layoutSizingHorizontal') === parentIsHorizontal;
          const result = translateSingleSizing(sizing, isPrimary ? 'primary' : 'counter');
          if (isPrimary) {
            // Primary axis: control via primaryAxisSizingMode on self (if auto-layout frame)
            // or layoutGrow for FILL in parent
            if ('layoutMode' in node && (node as FrameNode).layoutMode !== 'NONE') {
              (node as FrameNode).primaryAxisSizingMode = result.mode;
            }
            (node as any).layoutGrow = result.layoutGrow ?? 0;
          } else {
            // Counter axis: control via layoutAlign on self (STRETCH for FILL)
            if ('layoutMode' in node && (node as FrameNode).layoutMode !== 'NONE') {
              (node as FrameNode).counterAxisSizingMode = result.mode;
            }
            (node as any).layoutAlign = result.layoutAlign ?? 'INHERIT';
          }
        }

        // ── Phase 4: Resize (AFTER layout changes to prevent ordering bugs) ──
        if (props.resize != null && 'resize' in node) {
          const [w, h] = props.resize as [number, number];
          (node as FrameNode).resize(w, h);
        } else if ('resize' in node) {
          // Individual width/height — also handles layoutSizing FIXED linkage
          const f = node as FrameNode;
          const w = props.width as number | undefined;
          const h = props.height as number | undefined;
          if (w != null && h != null) {
            f.resize(w, h);
          } else if (w != null) {
            f.resize(w, f.height);
          } else if (h != null) {
            f.resize(f.width, h);
          }
        }

        // ── Phase 5: Text props (batch font load, then apply) ──
        if (node.type === 'TEXT') {
          const textNode = node as TextNode;
          const hasTextProps =
            (TEXT_KEYS.has('fontSize') && props.fontSize != null) ||
            (TEXT_KEYS.has('fontName') && props.fontName != null) ||
            Object.keys(props).some((k) => k in TEXT_DIRECT_PROPS);

          if (hasTextProps) {
            // Batch-load fonts: current font + requested fontName
            const fontsToLoad: FontName[] = [];
            if (textNode.fontName !== figma.mixed) {
              fontsToLoad.push(textNode.fontName);
            }
            if (props.fontName) {
              const fn = props.fontName as { family: string; style: string };
              fontsToLoad.push(await loadFontWithFallback(fn.family, fn.style));
            }
            await Promise.all(fontsToLoad.map((f) => figma.loadFontAsync(f)));

            // Apply fontName first (affects subsequent fontSize style matching)
            if (props.fontName) {
              const fn = props.fontName as { family: string; style: string };
              textNode.fontName = await loadFontWithFallback(fn.family, fn.style);
              if (useLib) {
                const currentFontSize = textNode.fontSize !== figma.mixed ? (textNode.fontSize as number) : undefined;
                if (currentFontSize != null) {
                  const styleMatch = getTextStyleId(currentFontSize, { fontFamily: fn.family, fontWeight: fn.style });
                  if (styleMatch) {
                    try {
                      await (textNode as any).setTextStyleIdAsync(styleMatch.id);
                    } catch {
                      /* skip */
                    }
                  }
                }
              }
            }

            // Apply fontSize with style binding
            if (props.fontSize != null) {
              textNode.fontSize = props.fontSize as number;
              if (useLib) {
                const fontHints =
                  textNode.fontName !== figma.mixed
                    ? { fontFamily: textNode.fontName.family, fontWeight: textNode.fontName.style }
                    : undefined;
                const styleMatch = getTextStyleId(props.fontSize as number, fontHints);
                if (styleMatch) {
                  try {
                    await (textNode as any).setTextStyleIdAsync(styleMatch.id);
                  } catch {
                    /* skip */
                  }
                } else {
                  try {
                    await autoBindTypography(textNode, props.fontSize as number, patchLibrary!, {
                      skipFontFamily: fontHints?.fontFamily !== undefined,
                    });
                  } catch {
                    /* skip */
                  }
                }
              }
            }

            // Apply remaining text direct props
            for (const key of Object.keys(props)) {
              if (key in TEXT_DIRECT_PROPS) {
                (textNode as any)[TEXT_DIRECT_PROPS[key]] = props[key];
              }
            }
          }
        }

        const entry: {
          nodeId: string;
          ok: boolean;
          _unknownProps?: string[];
          _warnings?: string[];
          _tokenBindingFailures?: TokenBindingFailure[];
        } = { nodeId: patch.nodeId, ok: true };
        if (unknownProps.length) entry._unknownProps = unknownProps;
        if (patchWarnings.length) entry._warnings = patchWarnings;
        if (patchBindingFailures.length) entry._tokenBindingFailures = patchBindingFailures;
        results.push(entry);
      } catch (err) {
        results.push({
          nodeId: patch.nodeId,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { results };
  });

  registerHandler('delete_node', async (params) => {
    const nodeId = params.nodeId as string;
    const node = await findNodeByIdAsync(nodeId);
    assertHandler(node, `Node not found: ${nodeId}`, 'NOT_FOUND');
    assertOnCurrentPage(node, nodeId);
    node.remove();
    return { ok: true };
  });

  registerHandler('delete_nodes', async (params) => {
    const nodeIds = params.nodeIds as string[];
    const results: Array<{ nodeId: string; ok: boolean; error?: string }> = [];
    for (const nodeId of nodeIds) {
      const node = await findNodeByIdAsync(nodeId);
      if (!node) {
        results.push({ nodeId, ok: false, error: 'Node not found' });
      } else {
        const page = getContainingPage(node);
        if (page && page.id !== figma.currentPage.id) {
          results.push({
            nodeId,
            ok: false,
            error: `Node is on page "${page.name}", not current page. Cross-page delete refused.`,
          });
        } else {
          node.remove();
          results.push({ nodeId, ok: true });
        }
      }
    }
    return { results };
  });

  // ─── Clone nodes ───
  registerHandler('clone_nodes', async (params) => {
    const items = params.items as Array<{ id: string; name?: string; parentId?: string; x?: number; y?: number }>;
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const item of items) {
      try {
        const node = await findNodeByIdAsync(item.id);
        assertHandler(node, `Node not found: ${item.id}`, 'NOT_FOUND');
        assertOnCurrentPage(node, item.id);
        // Pre-validate parent before cloning to avoid orphaned clones
        let targetParent: BaseNode | null = null;
        if (item.parentId) {
          targetParent = await findNodeByIdAsync(item.parentId);
          if (targetParent) assertOnCurrentPage(targetParent, item.parentId);
        }
        const clone = (node as SceneNode).clone();
        if (item.name) clone.name = item.name;
        if (item.x != null) clone.x = item.x;
        if (item.y != null) clone.y = item.y;
        if (targetParent && 'appendChild' in targetParent) {
          (targetParent as FrameNode).appendChild(clone);
        }
        results.push({ id: clone.id, ok: true });
      } catch (err) {
        results.push({ id: item.id, ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { results };
  });

  // ─── Reparent nodes ───
  registerHandler('reparent_nodes', async (params) => {
    const items = params.items as Array<{ id: string; parentId: string; index?: number }>;
    const results: Array<{ id: string; ok: boolean; error?: string; noChange?: boolean }> = [];
    for (const item of items) {
      try {
        const node = await findNodeByIdAsync(item.id);
        assertHandler(node, `Node not found: ${item.id}`, 'NOT_FOUND');
        assertOnCurrentPage(node, item.id);
        const parent = await findNodeByIdAsync(item.parentId);
        assertHandler(
          parent && 'appendChild' in parent,
          `Parent not found or not a container: ${item.parentId}`,
          'NOT_FOUND',
        );
        assertOnCurrentPage(parent!, item.parentId);
        const container = parent as FrameNode;
        const sceneNode = node as SceneNode;
        const beforeParentId = sceneNode.parent?.id;
        const beforeIndex = container.children.indexOf(sceneNode);

        if (item.index != null) {
          container.insertChild(item.index, sceneNode);
        } else {
          container.appendChild(sceneNode);
        }

        const afterIndex = container.children.indexOf(sceneNode);
        const noChange = beforeParentId === item.parentId && beforeIndex === afterIndex;
        results.push({ id: item.id, ok: true, ...(noChange ? { noChange: true } : {}) });
      } catch (err) {
        results.push({ id: item.id, ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { results };
  });

  // ─── Lint ignore ───
  registerHandler('set_lint_ignore', async (params) => {
    const nodeId = params.nodeId as string;
    const rules = params.rules as string; // comma-separated rule names or '*'
    const node = await findNodeByIdAsync(nodeId);
    assertHandler(node, `Node not found: ${nodeId}`, 'NOT_FOUND');
    if (rules) {
      (node as SceneNode).setPluginData(PLUGIN_DATA_KEYS.LINT_IGNORE, rules);
    } else {
      (node as SceneNode).setPluginData(PLUGIN_DATA_KEYS.LINT_IGNORE, '');
    }
    return { ok: true, nodeId, lintIgnore: rules || null };
  });
} // registerWriteNodeHandlers
