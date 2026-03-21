/**
 * Node write handlers — create, update, delete nodes.
 */

import { registerHandler } from '../registry.js';
import { simplifyNode } from '../adapters/node-simplifier.js';
import { hexToFigmaRgb } from '../utils/color.js';
import { autoBindDefault, autoBindTypography, type TypographyBindResult } from '../utils/design-context.js';
import { ensureLoaded, getTextStyleId, suggestTextStyle } from '../utils/style-registry.js';
import { findNodeByIdAsync } from '../utils/node-lookup.js';
import { STORAGE_KEYS } from '../constants.js';
import { applyFill, applyStroke, applyAutoLayout, applyCornerRadius, applyPerSideStrokeWeights, type AutoLayoutProps, translateSingleSizing, applyTokenField, applyTokenFields } from '../utils/node-helpers.js';
import { detectWrongShapeParams, rejectUnknownParams, inferStructure, inferChildSizing, normalizeAliases, summarizeHints, formatInferenceDiff, checkOverlappingSiblings, checkOverlappingSiblingsPostCreation, buildCorrectedPayload, type Hint } from '../utils/inline-tree.js';

const MODE_STORAGE_KEY = STORAGE_KEYS.MODE;
const LIBRARY_STORAGE_KEY = STORAGE_KEYS.LIBRARY;

/**
 * Load a font with fallback chain: requested style → Regular → Inter Regular.
 * Returns the font name that was successfully loaded.
 */
async function loadFontWithFallback(family: string, style: string): Promise<FontName> {
  const requested = { family, style };
  try {
    await figma.loadFontAsync(requested);
    return requested;
  } catch { /* requested style unavailable */ }
  if (style !== 'Regular') {
    const regular = { family, style: 'Regular' };
    try {
      await figma.loadFontAsync(regular);
      return regular;
    } catch { /* family Regular unavailable */ }
  }
  const fallback = { family: 'Inter', style: 'Regular' };
  await figma.loadFontAsync(fallback);
  return fallback;
}

// ─── Mode/Library cache ───
// Mode and library rarely change (only on explicit user action in the plugin UI).
// Cache them in memory to avoid repeated clientStorage reads on every handler call.
let _cachedMode: string | null = null;
let _cachedLibrary: string | undefined;
let _cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000; // refresh from storage every 30s

async function getCachedModeLibrary(): Promise<[string, string | undefined]> {
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

/**
 * Track the furthest right edge reserved by in-flight auto-positioned nodes.
 * This prevents concurrent create_frame / create_text calls from stacking at the same x.
 * Reset whenever the page changes or all children are cleared.
 */
let _reservedRightEdge: number | null = null;

/** Place node to the right of all existing page content when x/y not specified and no parent. */
function autoPositionOnPage(node: SceneNode, params: Record<string, unknown>): void {
  if (params.x != null || params.y != null || params.parentId) return;
  const children = figma.currentPage.children;
  if (children.length <= 1) { _reservedRightEdge = null; return; } // only the new node itself

  // Fast path: if we already have a reserved edge from a recent call, skip the full scan
  if (_reservedRightEdge !== null) {
    node.x = _reservedRightEdge + 64;
    _reservedRightEdge = node.x + node.width;
    return;
  }

  let maxRight = 0;
  for (const child of children) {
    if (child.id === node.id) continue;
    const box = child.absoluteBoundingBox;
    const right = box ? box.x + box.width : child.x + child.width;
    if (right > maxRight) maxRight = right;
  }
  node.x = maxRight + 64;
  _reservedRightEdge = node.x + node.width;
}

/** Attach node to a parent by ID, or auto-position on page if no parent. */
async function attachToParentOrPage(node: SceneNode, parentId: string | undefined, params: Record<string, unknown>): Promise<void> {
  if (parentId) {
    const parent = await findNodeByIdAsync(parentId);
    if (parent && 'appendChild' in parent) {
      (parent as FrameNode).appendChild(node);
    }
  } else {
    autoPositionOnPage(node, params);
  }
}

/**
 * Shared text library binding: color auto-bind + text style / typography variable binding.
 * Used by both standalone create_text and batch createNodeFromSpec text path.
 *
 * @returns { autoBound, typoStyle, typoResult } for the caller to build response metadata.
 */
/**
 * Infer fontWeight from fontStyle string for text style matching.
 * Maps common Figma font style names to weight keywords.
 */
function inferFontWeight(fontStyle?: string): string | undefined {
  if (!fontStyle) return undefined;
  const s = fontStyle.toLowerCase();
  // Direct weight names
  if (s.includes('bold')) return 'Bold';
  if (s.includes('semibold') || s.includes('semi bold') || s.includes('demibold')) return 'SemiBold';
  if (s.includes('medium')) return 'Medium';
  if (s.includes('light')) return 'Light';
  if (s.includes('thin') || s.includes('hairline')) return 'Thin';
  if (s.includes('black') || s.includes('heavy')) return 'Black';
  if (s.includes('extra bold') || s.includes('extrabold')) return 'ExtraBold';
  if (s.includes('extra light') || s.includes('extralight')) return 'ExtraLight';
  if (s === 'regular' || s === 'normal' || s === 'roman') return 'Regular';
  // Italic variants — strip "italic" and re-check
  if (s.includes('italic')) {
    const base = s.replace(/italic/i, '').trim();
    if (base) return inferFontWeight(base);
    return 'Regular'; // plain italic → Regular weight
  }
  return fontStyle; // pass through as-is for exact matching
}

async function applyTextLibraryBindings(
  text: TextNode,
  fontSize: number,
  library: string,
  props: { fill?: string | Record<string, unknown>; fontFamily?: string; fontStyle?: string },
  budgetExceeded?: () => boolean,
  options?: { stylesPreloaded?: boolean },
): Promise<{
  autoBound: string | null;
  typoStyle: string | null;
  typoResult: TypographyBindResult | null;
  colorHint?: string;
}> {
  const skip = budgetExceeded ?? (() => false);

  // Color + style registry load in parallel
  const colorPromise = (!props.fill && !skip())
    ? autoBindDefault(text, 'textColor', library)
    : Promise.resolve(null);
  const loadPromise = options?.stylesPreloaded ? Promise.resolve() : ensureLoaded(library);

  const [defaultBound] = await Promise.all([colorPromise, loadPromise]);

  // Apply fill using 5-format support (hex, _variable, _variableId, _style, Paint[])
  let autoBound = defaultBound;
  let colorHint: string | undefined;
  if (props.fill) {
    const fillResult = await applyFill(
      text as unknown as SceneNode & MinimalFillsMixin,
      props.fill as any, 'textColor', true, library,
      { stylesPreloaded: true, budgetExceeded: skip },
    );
    if (fillResult.autoBound) autoBound = fillResult.autoBound;
    colorHint = fillResult.colorHint;
  }

  // Typography: prefer text style, fall back to variable binding
  let typoStyle: string | null = null;
  let typoResult: TypographyBindResult | null = null;

  if (!skip()) {
    const fontWeight = inferFontWeight(props.fontStyle);
    const styleMatch = getTextStyleId(fontSize, {
      fontFamily: props.fontFamily,
      fontWeight,
    });
    if (styleMatch) {
      try {
        await (text as any).setTextStyleIdAsync(styleMatch.id);
        typoStyle = `style:${styleMatch.name}`;
      } catch (err) { console.warn('[figcraft] Text style apply failed:', err); }
    }

    if (!typoStyle && !skip()) {
      const skipFontFamily = props.fontFamily !== undefined;
      typoResult = await autoBindTypography(text, fontSize, library, { skipFontFamily });
    }
  }

  return { autoBound, typoStyle, typoResult, colorHint };
}

export function registerWriteNodeHandlers(): void {

registerHandler('create_frame', async (params) => {
  const name = (params.name as string) ?? 'Frame';
  const width = (params.width as number) ?? 100;
  const height = (params.height as number) ?? 100;
  const parentId = params.parentId as string | undefined;
  const [mode, library] = await getCachedModeLibrary();
  const useLibrary = mode === 'library' && !!library;

  // Run inference checks (same as batch path) for standalone create_frame
  const warnings: string[] = [];
  if (params) {
    const cssWarnings = detectWrongShapeParams(params as Record<string, unknown>, name);
    for (const w of cssWarnings) warnings.push(w);
  }

  const frame = figma.createFrame();
  frame.name = name;
  frame.resize(width, height);
  if (params.x != null) frame.x = params.x as number;
  if (params.y != null) frame.y = params.y as number;

  await applyAutoLayout(frame, params as AutoLayoutProps);

  const { autoBound, colorHint } = await applyFill(frame, params.fill as string | undefined, 'background', useLibrary, library);

  await attachToParentOrPage(frame, parentId, params as Record<string, unknown>);

  const result = simplifyNode(frame);
  return {
    ...result,
    ...(autoBound ? { autoBound } : undefined),
    ...(colorHint ? { colorHint } : undefined),
    ...(warnings.length > 0 ? { warnings } : undefined),
  };
});

registerHandler('create_text', async (params) => {
  const content = (params.content as string) ?? '';
  const fontSize = (params.fontSize as number) ?? 16;
  const fontFamily = (params.fontFamily as string) ?? 'Inter';
  const fontStyle = (params.fontStyle as string) ?? 'Regular';
  const parentId = params.parentId as string | undefined;
  const [mode, library] = await getCachedModeLibrary();

  const text = figma.createText();
  if (params.x != null) text.x = params.x as number;
  if (params.y != null) text.y = params.y as number;
  text.fontName = await loadFontWithFallback(fontFamily, fontStyle);
  text.fontSize = fontSize;
  text.characters = content;

  if (params.name) text.name = params.name as string;

  // Shared time budget for all library operations in create_text.
  const textBudgetStart = Date.now();
  const TEXT_LIBRARY_BUDGET_MS = 18_000;
  const textBudgetExceeded = () => Date.now() - textBudgetStart > TEXT_LIBRARY_BUDGET_MS;

  let autoBound: string | null = null;
  let typoResult: TypographyBindResult | null = null;
  let typoStyle: string | null = null;

  let colorHint: string | undefined;

  if (mode === 'library' && library) {
    const result = await applyTextLibraryBindings(
      text, fontSize, library,
      { fill: params.fill as any, fontFamily: params.fontFamily as string | undefined, fontStyle: params.fontStyle as string | undefined },
      textBudgetExceeded,
    );
    autoBound = result.autoBound;
    typoStyle = result.typoStyle;
    typoResult = result.typoResult;
    colorHint = result.colorHint;
  } else {
    if (params.fill && typeof params.fill === 'string') {
      text.fills = [{ type: 'SOLID', color: hexToFigmaRgb(params.fill) }];
    }
  }

  await attachToParentOrPage(text, parentId, params as Record<string, unknown>);

  const result = simplifyNode(text);
  const autoBoundInfo: Record<string, unknown> = {};
  if (autoBound) autoBoundInfo.color = autoBound;
  if (typoStyle) {
    autoBoundInfo.typography = typoStyle;
  } else if (typoResult) {
    autoBoundInfo.typography = typoResult.scale;
    if (!typoResult.exact) autoBoundInfo.typographyHint = typoResult.hint;
  }
  return {
    ...result,
    ...(Object.keys(autoBoundInfo).length > 0 ? { autoBound: autoBoundInfo } : undefined),
    ...(colorHint ? { colorHint } : undefined),
  };
});

registerHandler('set_text_content', async (params) => {
  const nodeId = params.nodeId as string;
  const content = params.content as string;

  const node = await findNodeByIdAsync(nodeId);
  if (!node || node.type !== 'TEXT') {
    return { error: `Text node not found: ${nodeId}` };
  }

  const text = node as TextNode;
  if (text.fontName !== figma.mixed) {
    await figma.loadFontAsync(text.fontName);
  }
  text.characters = content;
  return { ok: true };
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

  // Direct-assignment properties that need only a simple `node[key] = value` with a type guard.
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
  };

  const results: Array<{ nodeId: string; ok: boolean; error?: string }> = [];

  // Resolve all nodes in parallel — they are independent lookups
  const resolvedNodes = await Promise.all(
    patches.map((p) => findNodeByIdAsync(p.nodeId)),
  );

  for (let pi = 0; pi < patches.length; pi++) {
    const patch = patches[pi];
    try {
      const node = resolvedNodes[pi];
      if (!node) {
        results.push({ nodeId: patch.nodeId, ok: false, error: 'Node not found' });
        continue;
      }

      for (const [key, value] of Object.entries(patch.props)) {
        if (key === 'x' || key === 'y') {
          (node as SceneNode)[key] = value as number;
        } else if (key === 'name') {
          node.name = value as string;
        } else if (key === 'cornerRadius' && 'cornerRadius' in node) {
          // Token binding: supports uniform number, per-corner array [tl,tr,br,bl], or variable name string
          if (patchMode === 'library' && patchLibrary) {
            await applyCornerRadius(node as SceneNode, value as number | number[] | string, true);
          } else {
            await applyCornerRadius(node as SceneNode, value as number | number[] | string, false);
          }
        } else if (key === 'resize' && 'resize' in node) {
          const [w, h] = value as [number, number];
          (node as FrameNode).resize(w, h);
        } else if (key === 'fills' && 'fills' in node) {
          // 5-format fill support: hex string, {_variable}, {_variableId}, {_style}, Paint[]
          const fillRole = node.type === 'TEXT' ? 'textColor' : 'background';
          const useLib = patchMode === 'library' && !!patchLibrary;
          await applyFill(node as SceneNode & MinimalFillsMixin, value as any, fillRole, useLib, patchLibrary, { stylesPreloaded: true });
        } else if (key === 'strokes' && 'strokes' in node) {
          // 5-format stroke support: hex string, {_variable}, {_variableId}, {_style}, Paint[]
          // Preserve existing strokeWeight when only patching stroke color
          const existingWeight = 'strokeWeight' in node ? (node as any).strokeWeight as number : undefined;
          const useLib = patchMode === 'library' && !!patchLibrary;
          await applyStroke(node as any, value as any, existingWeight, useLib, patchLibrary);
        } else if (key === 'effects' && 'effects' in node) {
          (node as BlendMixin).effects = value as Effect[];
        } else if (key === 'constraints' && 'constraints' in node) {
          (node as ConstraintMixin).constraints = value as Constraints;
        } else if (key === 'fontSize' && node.type === 'TEXT') {
          const textNode = node as TextNode;
          if (textNode.fontName !== figma.mixed) {
            await figma.loadFontAsync(textNode.fontName);
          }
          textNode.fontSize = value as number;
          // Re-bind text style in library mode when fontSize changes
          if (patchMode === 'library' && patchLibrary) {
            const fontHints = textNode.fontName !== figma.mixed
              ? { fontFamily: textNode.fontName.family, fontWeight: textNode.fontName.style }
              : undefined;
            const styleMatch = getTextStyleId(value as number, fontHints);
            if (styleMatch) {
              try { await (textNode as any).setTextStyleIdAsync(styleMatch.id); } catch { /* skip */ }
            } else {
              // No text style match — fall back to typography variable binding
              try {
                await autoBindTypography(textNode, value as number, patchLibrary, {
                  skipFontFamily: fontHints?.fontFamily !== undefined,
                });
              } catch { /* skip — best effort */ }
            }
          }
        } else if (key === 'fontName' && node.type === 'TEXT') {
          const fn = value as { family: string; style: string };
          const textNode = node as TextNode;
          textNode.fontName = await loadFontWithFallback(fn.family, fn.style);
          // Re-bind text style in library mode when fontName changes (mirrors fontSize re-bind)
          if (patchMode === 'library' && patchLibrary) {
            const currentFontSize = textNode.fontSize !== figma.mixed ? textNode.fontSize as number : undefined;
            if (currentFontSize != null) {
              const styleMatch = getTextStyleId(currentFontSize, {
                fontFamily: fn.family,
                fontWeight: fn.style,
              });
              if (styleMatch) {
                try { await (textNode as any).setTextStyleIdAsync(styleMatch.id); } catch { /* skip */ }
              }
            }
          }
        } else if (key in DIRECT_PROPS && DIRECT_PROPS[key] in node) {
          // Token binding for numeric layout properties (itemSpacing, padding*, strokeWeight)
          const tokenBindableFields = new Set(['itemSpacing', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', 'strokeWeight', 'strokeTopWeight', 'strokeBottomWeight', 'strokeLeftWeight', 'strokeRightWeight']);
          if (patchMode === 'library' && patchLibrary && tokenBindableFields.has(key) && typeof value === 'number') {
            await applyTokenField(node as SceneNode, DIRECT_PROPS[key], value);
          } else {
            (node as any)[DIRECT_PROPS[key]] = value;
          }
        } else if ((key === 'layoutSizingHorizontal' || key === 'layoutSizingVertical') && 'layoutMode' in node) {
          // Translate high-level sizing to Figma native properties, clearing stale state
          const frameNode = node as FrameNode;
          const dir = frameNode.layoutMode;
          if (dir !== 'NONE') {
            const isHorizontal = dir === 'HORIZONTAL';
            const isPrimary = (key === 'layoutSizingHorizontal') === isHorizontal;
            const sizing = value as 'FIXED' | 'HUG' | 'FILL';
            const result = translateSingleSizing(sizing, isPrimary ? 'primary' : 'counter');
            if (isPrimary) {
              frameNode.primaryAxisSizingMode = result.mode;
              (frameNode as any).layoutGrow = result.layoutGrow ?? 0;
            } else {
              frameNode.counterAxisSizingMode = result.mode;
              (frameNode as any).layoutAlign = result.layoutAlign ?? 'INHERIT';
            }
          }
        }
      }

      results.push({ nodeId: patch.nodeId, ok: true });
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
  if (!node) return { error: `Node not found: ${nodeId}` };
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
      node.remove();
      results.push({ nodeId, ok: true });
    }
  }
  return { results };
});

registerHandler('clone_node', async (params) => {
  const nodeId = params.nodeId as string;
  const node = await findNodeByIdAsync(nodeId);
  if (!node || !('clone' in node)) {
    return { error: `Node not found or not cloneable: ${nodeId}` };
  }
  const clone = (node as SceneNode).clone();
  return simplifyNode(clone);
});

registerHandler('insert_child', async (params) => {
  const parentId = params.parentId as string;
  const childId = params.childId as string;
  const index = params.index as number | undefined;

  const parent = await findNodeByIdAsync(parentId);
  const child = await findNodeByIdAsync(childId);

  if (!parent || !('appendChild' in parent)) {
    return { error: `Parent not found or not a container: ${parentId}` };
  }
  if (!child) {
    return { error: `Child not found: ${childId}` };
  }

  if (index !== undefined) {
    (parent as FrameNode).insertChild(index, child as SceneNode);
  } else {
    (parent as FrameNode).appendChild(child as SceneNode);
  }

  return { ok: true };
});

// ─── Batch create: recursive node tree in one call ───

interface NodeSpec {
  type: 'frame' | 'text' | 'rectangle' | 'ellipse' | 'line' | 'vector' | 'instance';
  name?: string;
  props?: Record<string, unknown>;
  children?: NodeSpec[];
}

/** Library context passed through the recursive tree to avoid repeated storage reads. */
interface LibraryCtx {
  mode: string;
  library: string | undefined;
  /** Shared time budget start timestamp. If set, recursive calls check against it. */
  budgetStart?: number;
  /** Time budget in ms. */
  budgetMs?: number;
  /** Accumulated typed hints from creation. */
  hints: Hint[];
  /** Accumulated FLOAT variable token bindings (e.g. "cornerRadius:spacing/md"). */
  tokensBound: string[];
  /** Accumulated inference fix descriptions for diff output. */
  inferenceFixes: string[];
  /** Confidence-annotated inference fixes for selective diff output. */
  annotatedFixes: Array<{ message: string; confidence: 'deterministic' | 'ambiguous' }>;
  /** Corrected payloads for ambiguous inferences — agent can review and revert via patch_nodes. */
  correctedPayloads: Array<{ nodeId: string; nodeName: string; original: Record<string, unknown>; corrected: Record<string, unknown>; ambiguousFixes: string[] }>;
}

/** Check if the shared time budget has been exceeded. */
function budgetExceeded(ctx: LibraryCtx): boolean {
  if (ctx.budgetStart == null || ctx.budgetMs == null) return false;
  return Date.now() - ctx.budgetStart > ctx.budgetMs;
}

/**
 * Apply auto-layout child properties (layoutAlign, layoutGrow) after a node
 * has been appended to its parent. These properties only work on children of
 * auto-layout frames.
 */
function applyLayoutChildProps(node: SceneNode, props: Record<string, unknown>): void {
  if (props.layoutAlign != null && 'layoutAlign' in node) {
    (node as SceneNode & { layoutAlign: string }).layoutAlign = props.layoutAlign as string;
  }
  if (props.layoutGrow != null && 'layoutGrow' in node) {
    (node as SceneNode & { layoutGrow: number }).layoutGrow = props.layoutGrow as number;
  }
}

/** Append node to parent and apply layout child props. */
function appendToParent(node: SceneNode, parentNode: BaseNode | undefined, props: Record<string, unknown>): void {
  if (parentNode && 'appendChild' in parentNode) {
    (parentNode as FrameNode).appendChild(node);
    applyLayoutChildProps(node, props);
  }
}

/** Collect a structural warning if applicable. */
function collectWarnings(spec: NodeSpec, ctx: LibraryCtx, fillResult: { autoBound: string | null; colorHint?: string }, useLibrary: boolean, wasAutoPromoted?: boolean): void {
  const p = spec.props;
  const fill = p?.fill;
  if (fill && useLibrary && !fillResult.autoBound) {
    // Warn for both hex strings (hardcoded) and structured formats (_variable/_style/_variableId) that failed to resolve
    const fillLabel = typeof fill === 'string' ? fill : JSON.stringify(fill);
    const msg = fillResult.colorHint
      ? `Hardcoded fill ${fillLabel} on "${spec.name ?? spec.type}" — ${fillResult.colorHint}`
      : typeof fill === 'string'
        ? `Hardcoded fill ${fill} on "${spec.name ?? spec.type}" — no matching paint style found`
        : null; // structured format without colorHint means it was applied as raw Paint[] — no warning needed
    if (msg) ctx.hints.push({ type: 'suggest', message: msg });
  }
  if (spec.type === 'frame' && spec.children && spec.children.length > 0 && !p?.autoLayout && !wasAutoPromoted) {
    ctx.hints.push({ type: 'warn', message: `Frame "${spec.name ?? 'Frame'}" has ${spec.children.length} children but no auto-layout` });
  }
  if (!useLibrary && spec.type === 'frame' && !fill && spec.children && spec.children.length > 0) {
    ctx.hints.push({
      type: 'warn',
      message: `"${spec.name ?? 'Frame'}": no fill in Design Creator mode — frame will be transparent. Add props.fill if a background is intended.`,
    });
  }
}

async function createNodeFromSpec(spec: NodeSpec, parentNode: BaseNode | undefined, ctx: LibraryCtx): Promise<SceneNode> {
  const useLibrary = ctx.mode === 'library' && !!ctx.library && !budgetExceeded(ctx);

  // Normalize CSS-style aliases before any other processing
  if (spec.props) {
    const aliasHints = normalizeAliases(spec.props, spec.name ?? spec.type, spec.type);
    ctx.hints.push(...aliasHints);
  }

  // Detect remaining CSS-style param names and add corrective warnings
  // Use strict rejection for error-level feedback on unknown params
  if (spec.props) {
    const cssWarnings = detectWrongShapeParams(spec.props, spec.name ?? spec.type);
    for (const w of cssWarnings) ctx.hints.push({ type: 'warn', message: w });
    const unknownHints = rejectUnknownParams(spec.props, spec.name ?? spec.type, spec.type);
    ctx.hints.push(...unknownHints);
  }

  if (spec.type === 'frame') {
    // Deep-clone props before inference so we can diff original vs corrected (staging mechanism)
    const originalProps = spec.props ? JSON.parse(JSON.stringify(spec.props)) : {};

    // Run structure inference before creation (may mutate spec.props and children props)
    const inference = inferStructure(spec);
    const wasAutoPromoted = inference.fixes.some((f) => f.includes('auto-promoted'));
    for (const fix of inference.fixes) ctx.hints.push({ type: 'confirm', message: fix });
    ctx.inferenceFixes.push(...inference.fixes);
    ctx.annotatedFixes.push(...inference.annotatedFixes);
    for (const amb of inference.ambiguous) ctx.hints.push({ type: 'warn', message: amb });

    // Staging: collect ambiguous fixes for this frame's own props
    const selfAmbiguousFixes = inference.annotatedFixes
      .filter(f => f.confidence === 'ambiguous' && f.message.startsWith(`"${spec.name ?? 'Frame'}"`))
      .map(f => f.message);

    // Also collect correctedNodes from recursive child inference (children modified by parent's inferStructure)
    const childCorrectedNodes = inference.correctedNodes;

    const frame = figma.createFrame();
    const p = spec.props ?? {};
    frame.name = (spec.name as string) ?? 'Frame';
    frame.resize((p.width as number) ?? 100, (p.height as number) ?? 100);
    if (p.x != null) frame.x = p.x as number;
    if (p.y != null) frame.y = p.y as number;

    // Record corrected payload now that we have the node ID
    // Self: this frame's own props were modified by inference
    if (selfAmbiguousFixes.length > 0) {
      ctx.correctedPayloads.push({
        nodeId: frame.id,
        nodeName: frame.name,
        original: originalProps,
        corrected: JSON.parse(JSON.stringify(spec.props ?? {})),
        ambiguousFixes: selfAmbiguousFixes,
      });
    }
    // Children: props modified by parent's inferStructure (nodeId not yet available — filled when child is created)
    for (const cn of childCorrectedNodes) {
      ctx.correctedPayloads.push({
        nodeId: '', // placeholder — backfilled when child frame is created below
        nodeName: cn.nodeName,
        original: cn.original,
        corrected: cn.corrected,
        ambiguousFixes: cn.ambiguousFixes,
      });
    }

    // Backfill nodeId for any pending correctedPayload entry that matches this frame's name
    // (recorded by a parent's inferStructure before this frame was created)
    const pending = ctx.correctedPayloads.find(cp => cp.nodeId === '' && cp.nodeName === frame.name);
    if (pending) pending.nodeId = frame.id;

    const fillResult = await applyFill(
      frame, p.fill as any, 'background',
      useLibrary, ctx.library, { stylesPreloaded: true, budgetExceeded: () => budgetExceeded(ctx) },
    );

    // cornerRadius: supports uniform number, per-corner array, or variable name string
    if (p.cornerRadius != null) {
      const crBound = await applyCornerRadius(frame, p.cornerRadius as number | number[] | string, useLibrary, () => budgetExceeded(ctx));
      ctx.tokensBound.push(...crBound);
    }
    const alTokens = await applyAutoLayout(frame, p as AutoLayoutProps, {
      useTokenBinding: useLibrary,
      budgetExceeded: () => budgetExceeded(ctx),
    });
    ctx.tokensBound.push(...alTokens);

    // Apply stroke if specified (e.g. input fields inferred by inline-tree)
    if (p.stroke != null || p.strokeWeight != null) {
      await applyStroke(frame, p.stroke as any, p.strokeWeight as number | undefined, useLibrary, ctx.library);
    }

    // Apply per-side stroke weights if specified (e.g. strokeTopWeight, strokeBottomWeight)
    const sideStrokeBound = await applyPerSideStrokeWeights(frame, p, useLibrary, () => budgetExceeded(ctx));
    ctx.tokensBound.push(...sideStrokeBound);

    collectWarnings(spec, ctx, fillResult, useLibrary, wasAutoPromoted);
    appendToParent(frame, parentNode, p);

    if (spec.children) {
      const parentHasAL = !!p.autoLayout;

      // Check for overlapping siblings in non-auto-layout parents
      if (!parentHasAL) {
        const overlapHints = checkOverlappingSiblings(spec.children, frame.name);
        ctx.hints.push(...overlapHints);
      }

      for (let ci = 0; ci < spec.children.length; ci++) {
        try {
          // Infer child sizing defaults before creation
          const childSpec = spec.children[ci];
          if (parentHasAL) {
            // Ensure props exists so inference can set defaults (e.g. layoutAlign)
            if (!childSpec.props) childSpec.props = {};
            const sizingWarnings = inferChildSizing(
              childSpec.type, childSpec.props, parentHasAL,
              childSpec.name ?? childSpec.type,
              {
                layoutDirection: (p.layoutDirection as string) ?? 'VERTICAL',
                parentName: frame.name,
                parentWidth: (p.width as number) ?? undefined,
                parentHeight: (p.height as number) ?? undefined,
              },
            );
            for (const w of sizingWarnings) {
              // FIXED/FIXED warnings need agent attention; other sizing inferences are deterministic
              const hintType = w.includes('FIXED/FIXED') ? 'warn' : 'confirm';
              ctx.hints.push({ type: hintType, message: w });
            }
          }
          await createNodeFromSpec(childSpec, frame, ctx);
        } catch (childErr) {
          const childName = spec.children[ci].name ?? spec.children[ci].type;
          ctx.hints.push({ type: 'error', message: `Child "${childName}" of "${frame.name}" failed: ${childErr instanceof Error ? childErr.message : String(childErr)}` });
        }
      }
    }
    return frame;
  } else if (spec.type === 'text') {
    const p = spec.props ?? {};
    const fontFamily = (p.fontFamily as string) ?? 'Inter';
    const fontStyle = (p.fontStyle as string) ?? 'Regular';
    const fontSize = (p.fontSize as number) ?? 16;
    const text = figma.createText();
    text.fontName = await loadFontWithFallback(fontFamily, fontStyle);
    text.fontSize = fontSize;
    text.characters = (p.content as string) ?? '';
    if (spec.name) text.name = spec.name;
    if (useLibrary) {
      const textBindResult = await applyTextLibraryBindings(
        text, fontSize, ctx.library!,
        { fill: p.fill as any, fontFamily: p.fontFamily as string | undefined, fontStyle: p.fontStyle as string | undefined },
        () => budgetExceeded(ctx),
        { stylesPreloaded: true },
      ).catch(() => null);
      // Propagate colorHint from text library binding to hints
      if (textBindResult?.colorHint) {
        ctx.hints.push({ type: 'suggest', message: `"${spec.name ?? 'text'}": ${textBindResult.colorHint}` });
      }
      // Suggest text style when manual font properties are used without a style match
      if (p.fontFamily || p.fontStyle) {
        const suggestion = suggestTextStyle(fontSize, p.fontFamily as string | undefined, p.fontStyle as string | undefined);
        if (suggestion && !suggestion.exact) {
          ctx.hints.push({ type: 'suggest', message: `"${spec.name ?? 'text'}": ${suggestion.hint}` });
        }
      }
    } else if (p.fill) {
      // Design Creator mode: apply fill directly (supports hex string only in non-library mode)
      if (typeof p.fill === 'string') {
        text.fills = [{ type: 'SOLID', color: hexToFigmaRgb(p.fill as string) }];
      }
    }
    appendToParent(text, parentNode, p);
    return text;
  } else if (spec.type === 'rectangle') {
    const p = spec.props ?? {};
    const rect = figma.createRectangle();
    rect.name = spec.name ?? 'Rectangle';
    rect.resize((p.width as number) ?? 100, (p.height as number) ?? 100);
    if (p.x != null) rect.x = p.x as number;
    if (p.y != null) rect.y = p.y as number;
    if (p.cornerRadius != null) {
      const crBound = await applyCornerRadius(rect, p.cornerRadius as number | number[] | string, useLibrary, () => budgetExceeded(ctx));
      ctx.tokensBound.push(...crBound);
    }

    const fillResult = await applyFill(
      rect, p.fill as any, 'background',
      useLibrary, ctx.library, { stylesPreloaded: true, budgetExceeded: () => budgetExceeded(ctx) },
    );
    await applyStroke(rect, p.stroke as any, p.strokeWeight as number | undefined, useLibrary, ctx.library);

    collectWarnings(spec, ctx, fillResult, useLibrary);
    appendToParent(rect, parentNode, p);
    return rect;
  } else if (spec.type === 'ellipse') {
    const p = spec.props ?? {};
    const ellipse = figma.createEllipse();
    ellipse.name = spec.name ?? 'Ellipse';
    ellipse.resize((p.width as number) ?? 100, (p.height as number) ?? 100);
    if (p.x != null) ellipse.x = p.x as number;
    if (p.y != null) ellipse.y = p.y as number;

    const fillResult = await applyFill(
      ellipse, p.fill as any, 'background',
      useLibrary, ctx.library, { stylesPreloaded: true, budgetExceeded: () => budgetExceeded(ctx) },
    );
    await applyStroke(ellipse, p.stroke as any, p.strokeWeight as number | undefined, useLibrary, ctx.library);

    collectWarnings(spec, ctx, fillResult, useLibrary);
    appendToParent(ellipse, parentNode, p);
    return ellipse;
  } else if (spec.type === 'vector') {
    const p = spec.props ?? {};
    const svgString = p.svg as string;
    if (!svgString) throw new Error('vector type requires props.svg');
    const vectorNode = figma.createNodeFromSvg(svgString);
    vectorNode.name = spec.name ?? 'Vector';
    if (p.x != null) vectorNode.x = p.x as number;
    if (p.y != null) vectorNode.y = p.y as number;
    if (p.resize) {
      const [w, h] = p.resize as [number, number];
      vectorNode.resize(w, h);
    } else if (p.width != null || p.height != null) {
      vectorNode.resize((p.width as number) ?? vectorNode.width, (p.height as number) ?? vectorNode.height);
    }
    appendToParent(vectorNode, parentNode, p);
    return vectorNode;
  } else if (spec.type === 'instance') {
    const p = spec.props ?? {};
    const componentKey = p.componentKey as string | undefined;
    const componentId = p.componentId as string | undefined;
    if (!componentKey && !componentId) {
      throw new Error('instance type requires props.componentKey or props.componentId');
    }

    let component: ComponentNode | null = null;
    if (componentKey) {
      try {
        component = await figma.importComponentByKeyAsync(componentKey);
      } catch (importErr) {
        throw new Error(`Failed to import component by key "${componentKey}": ${importErr instanceof Error ? importErr.message : String(importErr)}`);
      }
    } else {
      const found = await findNodeByIdAsync(componentId!);
      if (found && found.type === 'COMPONENT') {
        component = found as ComponentNode;
      } else if (found && found.type === 'COMPONENT_SET') {
        // ComponentSet passed — pick the default variant (first child)
        const set = found as ComponentSetNode;
        if (set.children.length > 0 && set.children[0].type === 'COMPONENT') {
          component = set.children[0] as ComponentNode;
          ctx.hints.push({ type: 'warn', message: `"${spec.name ?? 'instance'}": componentId "${componentId}" is a ComponentSet, using default variant "${component.name}"` });
        }
      }
    }
    if (!component) {
      // Enhanced error: list available components so the agent can self-correct
      const localComponents = figma.currentPage.findAll((n) => n.type === 'COMPONENT');
      const available = localComponents.slice(0, 10).map((c) => `"${c.name}" (${c.id})`);
      const suffix = available.length > 0
        ? ` Available local components: ${available.join(', ')}${localComponents.length > 10 ? ` … and ${localComponents.length - 10} more` : ''}`
        : ' No local components found on current page.';
      throw new Error(`Component not found: ${componentKey ?? componentId}.${suffix}`);
    }

    const instance = component.createInstance();
    if (spec.name) instance.name = spec.name;

    // Apply variant/property overrides
    if (p.properties && typeof p.properties === 'object') {
      for (const [key, value] of Object.entries(p.properties as Record<string, string>)) {
        try {
          instance.setProperties({ [key]: value });
        } catch { /* property may not exist — skip */ }
      }
    }

    appendToParent(instance, parentNode, p);

    // Warn if children were specified (instances don't support inline children)
    if (spec.children && spec.children.length > 0) {
      ctx.hints.push({ type: 'warn', message: `"${spec.name ?? 'instance'}": children ignored — instance children are defined by the component` });
    }

    return instance;
  } else {
    // line — supports 5-format stroke (hex, _variable, _variableId, _style, Paint[])
    const p = spec.props ?? {};
    const line = figma.createLine();
    line.name = spec.name ?? 'Line';
    line.resize((p.length as number) ?? 100, 0);
    if (p.x != null) line.x = p.x as number;
    if (p.y != null) line.y = p.y as number;
    if (p.rotation != null) line.rotation = p.rotation as number;
    const strokeInput = p.stroke ?? '#000000';
    await applyStroke(line, strokeInput as any, (p.strokeWeight as number) ?? 1, useLibrary, ctx.library);
    appendToParent(line, parentNode, p);
    return line;
  }
}

/** Count total nodes in a spec tree (for dynamic time budget). */
function countSpecNodes(specs: NodeSpec[]): number {
  let count = 0;
  for (const s of specs) {
    count += 1;
    if (s.children) count += countSpecNodes(s.children);
  }
  return count;
}

registerHandler('create_document', async (params) => {
  const nodes = params.nodes as NodeSpec[];
  const parentId = params.parentId as string | undefined;
  const commandId = params._commandId as string | undefined;
  const [docMode, docLibrary] = await getCachedModeLibrary();

  // Dynamic time budget: library mode needs more time per node due to token binding network calls.
  // Base 10s + per-node cost (500ms library, 350ms creator). Clamped to [10s, 24s] (stay under 25s handler ceiling).
  const nodeCount = countSpecNodes(nodes);
  const perNodeMs = (docMode === 'library' && docLibrary) ? 500 : 350;
  const dynamicBudget = Math.min(24_000, Math.max(10_000, 10_000 + nodeCount * perNodeMs));
  const ctx: LibraryCtx = { mode: docMode, library: docLibrary, budgetStart: Date.now(), budgetMs: dynamicBudget, hints: [], tokensBound: [], inferenceFixes: [], annotatedFixes: [], correctedPayloads: [] };

  let parent: BaseNode | undefined;
  if (docMode === 'library' && docLibrary) {
    // Parallelize style loading with parent node lookup — they are independent.
    const parentPromise = parentId
      ? findNodeByIdAsync(parentId)
      : Promise.resolve(undefined);
    const [, foundParent] = await Promise.all([
      ensureLoaded(docLibrary),
      parentPromise,
    ]);
    if (foundParent) parent = foundParent;
  } else if (parentId) {
    const found = await findNodeByIdAsync(parentId);
    if (found) parent = found;
  }

  // Early warning: top-level frames with no fill in Design Creator mode will be transparent
  // (nested frames are warned by collectWarnings during recursive creation)
  if (!(docMode === 'library' && docLibrary) && !parentId) {
    for (const spec of nodes) {
      if (spec.type === 'frame' && !spec.props?.fill && !spec.children?.length) {
        ctx.hints.push({
          type: 'warn',
          message: `"${spec.name ?? 'Frame'}": no fill specified in Design Creator mode — frame will be transparent. Add props.fill if a background is intended.`,
        });
      }
    }
  }

  const created: Array<{ id: string; name: string; type: string }> = [];
  const errors: Array<{ index: number; name?: string; type: string; error: string }> = [];
  let timeBudgetExceeded = false;
  const reportProgress = nodeCount > 3;

  for (let i = 0; i < nodes.length; i++) {
    if (budgetExceeded(ctx)) {
      timeBudgetExceeded = true;
      console.warn(`[figcraft] create_document time budget exceeded after ${created.length} nodes`);
      break;
    }
    const spec = nodes[i];
    try {
      // Report progress for large batches to keep UI responsive
      // When commandId is provided, progress messages are forwarded through the relay
      // to the MCP bridge, which resets the pending request timeout (extends by 30s).
      if (reportProgress) {
        try {
          const progressMsg: Record<string, unknown> = {
            type: 'create-progress',
            current: i + 1,
            total: nodes.length,
            name: spec.name ?? spec.type,
          };
          // Also send command_progress through relay to extend bridge timeout
          if (commandId) {
            progressMsg.type = 'command_progress';
            progressMsg.commandId = commandId;
          }
          figma.ui.postMessage(progressMsg);
        } catch { /* UI may not be open — skip */ }
      }
      const node = await createNodeFromSpec(spec, parent, ctx);
      created.push({ id: node.id, name: node.name, type: node.type });
      if (!parent) {
        autoPositionOnPage(node, spec.props ?? {});
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push({ index: i, name: spec.name, type: spec.type, error: errorMsg });
      console.warn(`[figcraft] create_document node[${i}] "${spec.name ?? spec.type}" failed:`, errorMsg);
    }
  }

  const result: Record<string, unknown> = { ok: errors.length === 0, created };
  if (errors.length > 0) result.errors = errors;
  if (ctx.hints.length > 0) result.warnings = summarizeHints(ctx.hints);
  if (ctx.tokensBound.length > 0) result.tokensBound = ctx.tokensBound;
  if (ctx.inferenceFixes.length > 0) {
    const diff = formatInferenceDiff(ctx.inferenceFixes, ctx.annotatedFixes);
    if (diff) result.inferenceDiff = diff;
  }
  if (ctx.correctedPayloads.length > 0) {
    // Filter out entries where nodeId was never backfilled (child creation failed)
    const resolved = ctx.correctedPayloads.filter(cp => cp.nodeId !== '');
    if (resolved.length > 0) result.correctedPayload = resolved;
  }
  if (timeBudgetExceeded) {
    result.truncated = true;
    result.message = `Time budget exceeded, created ${created.length}/${nodes.length} nodes`;
  }

  // Auto-focus: select and scroll to created top-level nodes
  if (created.length > 0) {
    try {
      const createdNodes = created
        .map((c) => figma.getNodeById(c.id))
        .filter((n): n is SceneNode => n !== null && 'type' in n);
      if (createdNodes.length > 0) {
        figma.currentPage.selection = createdNodes;
        figma.viewport.scrollAndZoomIntoView(createdNodes);

        // Post-creation overlap detection using actual node positions (more accurate than spec-based)
        for (const node of createdNodes) {
          if ('children' in node && (node as any).layoutMode === 'NONE') {
            const frameNode = node as FrameNode;
            const overlapHints = checkOverlappingSiblingsPostCreation(frameNode);
            ctx.hints.push(...overlapHints);
          }
        }
        // Re-check warnings after post-creation detection
        if (ctx.hints.length > 0) result.warnings = summarizeHints(ctx.hints);
      }
    } catch { /* best effort — don't fail the whole operation */ }
  }

  return result;
});

// ─── Shape creation: rectangle, ellipse, line ───

registerHandler('create_rectangle', async (params) => {
  const rect = figma.createRectangle();
  rect.name = (params.name as string) ?? 'Rectangle';
  rect.resize((params.width as number) ?? 100, (params.height as number) ?? 100);
  if (params.x != null) rect.x = params.x as number;
  if (params.y != null) rect.y = params.y as number;

  const [mode, library] = await getCachedModeLibrary();
  const useLibrary = mode === 'library' && !!library;

  if (params.cornerRadius != null) {
    await applyCornerRadius(rect, params.cornerRadius as number | number[] | string, useLibrary);
  }

  const { autoBound, colorHint } = await applyFill(rect, params.fill as string | undefined, 'background', useLibrary, library);
  await applyStroke(rect, params.stroke as string | undefined, params.strokeWeight as number | undefined, useLibrary, library);

  await attachToParentOrPage(rect, params.parentId as string | undefined, params as Record<string, unknown>);

  const result = simplifyNode(rect);
  return {
    ...result,
    ...(autoBound ? { autoBound } : undefined),
    ...(colorHint ? { colorHint } : undefined),
  };
});

registerHandler('create_ellipse', async (params) => {
  const ellipse = figma.createEllipse();
  ellipse.name = (params.name as string) ?? 'Ellipse';
  ellipse.resize((params.width as number) ?? 100, (params.height as number) ?? 100);
  if (params.x != null) ellipse.x = params.x as number;
  if (params.y != null) ellipse.y = params.y as number;

  const [mode, library] = await getCachedModeLibrary();
  const useLibrary = mode === 'library' && !!library;

  const { autoBound, colorHint } = await applyFill(ellipse, params.fill as string | undefined, 'background', useLibrary, library);
  await applyStroke(ellipse, params.stroke as string | undefined, params.strokeWeight as number | undefined, useLibrary, library);

  await attachToParentOrPage(ellipse, params.parentId as string | undefined, params as Record<string, unknown>);

  const result = simplifyNode(ellipse);
  return {
    ...result,
    ...(autoBound ? { autoBound } : undefined),
    ...(colorHint ? { colorHint } : undefined),
  };
});

registerHandler('create_line', async (params) => {
  const line = figma.createLine();
  line.name = (params.name as string) ?? 'Line';
  const length = (params.length as number) ?? 100;
  line.resize(length, 0);
  if (params.x != null) line.x = params.x as number;
  if (params.y != null) line.y = params.y as number;
  if (params.rotation != null) line.rotation = params.rotation as number;

  const [mode, library] = await getCachedModeLibrary();
  const useLibrary = mode === 'library' && !!library;
  const strokeInput = params.stroke ?? '#000000';
  await applyStroke(line, strokeInput as any, (params.strokeWeight as number) ?? 1, useLibrary, library);

  await attachToParentOrPage(line, params.parentId as string | undefined, params as Record<string, unknown>);

  return simplifyNode(line);
});

registerHandler('save_version_history', async (params) => {
  const title = (params.title as string) ?? 'FigCraft checkpoint';
  const description = (params.description as string) ?? '';
  await figma.saveVersionHistoryAsync(title, description);
  return { ok: true, title, description };
});

registerHandler('create_section', async (params) => {
  const section = figma.createSection();
  section.name = (params.name as string) ?? 'Section';

  if (params.x != null) section.x = params.x as number;
  if (params.y != null) section.y = params.y as number;

  if (params.childIds) {
    const ids = params.childIds as string[];
    for (const id of ids) {
      const child = await findNodeByIdAsync(id);
      if (child && 'parent' in child) {
        section.appendChild(child as SceneNode);
      }
    }
  }

  if (params.x == null && params.y == null && !params.childIds) {
    autoPositionOnPage(section, params as Record<string, unknown>);
  }

  return { id: section.id, name: section.name, x: section.x, y: section.y };
});

registerHandler('boolean_operation', async (params) => {
  const nodeIds = params.nodeIds as string[];
  const operation = params.operation as 'UNION' | 'SUBTRACT' | 'INTERSECT' | 'EXCLUDE';

  const resolved = await Promise.all(nodeIds.map((id) => findNodeByIdAsync(id)));
  const nodes = resolved.filter((n): n is SceneNode =>
    n !== null && 'type' in n && n.type !== 'PAGE' && n.type !== 'DOCUMENT',
  );

  if (nodes.length < 2) {
    throw new Error('boolean_operation requires at least 2 valid nodes');
  }

  const parent = nodes[0].parent as (BaseNode & ChildrenMixin) | null;
  if (!parent) throw new Error('Nodes have no parent');

  let result: BooleanOperationNode;
  switch (operation) {
    case 'UNION':      result = figma.union(nodes, parent); break;
    case 'SUBTRACT':   result = figma.subtract(nodes, parent); break;
    case 'INTERSECT':  result = figma.intersect(nodes, parent); break;
    case 'EXCLUDE':    result = figma.exclude(nodes, parent); break;
    default: throw new Error(`Unknown operation: ${operation}`);
  }

  if (params.name) result.name = params.name as string;

  return simplifyNode(result);
});

} // registerWriteNodeHandlers
