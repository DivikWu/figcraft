/**
 * Node write handlers — patch, set_text_content, delete, create_frame, create_text.
 */

import { registerHandler } from '../registry.js';
import { simplifyNode } from '../adapters/node-simplifier.js';
import { autoBindTypography } from '../utils/design-context.js';
import { ensureLoaded, getTextStyleId } from '../utils/style-registry.js';
import { findNodeByIdAsync } from '../utils/node-lookup.js';
import { STORAGE_KEYS } from '../constants.js';
import { applyFill, applyStroke, applyCornerRadius, applyTokenField, translateSingleSizing } from '../utils/node-helpers.js';
import { registerCache } from '../utils/cache-manager.js';
import { assertHandler } from '../utils/handler-error.js';

const MODE_STORAGE_KEY = STORAGE_KEYS.MODE;
const LIBRARY_STORAGE_KEY = STORAGE_KEYS.LIBRARY;

/**
 * Load a font with fallback chain: requested style → Regular → Inter Regular.
 */
export async function loadFontWithFallback(family: string, style: string): Promise<FontName> {
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
  };

  const results: Array<{ nodeId: string; ok: boolean; error?: string }> = [];
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
          if (patchMode === 'library' && patchLibrary) {
            await applyCornerRadius(node as SceneNode, value as number | number[] | string, true);
          } else {
            await applyCornerRadius(node as SceneNode, value as number | number[] | string, false);
          }
        } else if (key === 'resize' && 'resize' in node) {
          const [w, h] = value as [number, number];
          (node as FrameNode).resize(w, h);
        } else if (key === 'fills' && 'fills' in node) {
          const fillRole = node.type === 'TEXT' ? 'textColor' : 'background';
          const useLib = patchMode === 'library' && !!patchLibrary;
          await applyFill(node as SceneNode & MinimalFillsMixin, value as any, fillRole, useLib, patchLibrary, { stylesPreloaded: true });
        } else if (key === 'strokes' && 'strokes' in node) {
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
          if (patchMode === 'library' && patchLibrary) {
            const fontHints = textNode.fontName !== figma.mixed
              ? { fontFamily: textNode.fontName.family, fontWeight: textNode.fontName.style }
              : undefined;
            const styleMatch = getTextStyleId(value as number, fontHints);
            if (styleMatch) {
              try { await (textNode as any).setTextStyleIdAsync(styleMatch.id); } catch { /* skip */ }
            } else {
              try {
                await autoBindTypography(textNode, value as number, patchLibrary, {
                  skipFontFamily: fontHints?.fontFamily !== undefined,
                });
              } catch { /* skip */ }
            }
          }
        } else if (key === 'fontName' && node.type === 'TEXT') {
          const fn = value as { family: string; style: string };
          const textNode = node as TextNode;
          textNode.fontName = await loadFontWithFallback(fn.family, fn.style);
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
          const tokenBindableFields = new Set(['itemSpacing', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', 'strokeWeight', 'strokeTopWeight', 'strokeBottomWeight', 'strokeLeftWeight', 'strokeRightWeight']);
          if (patchMode === 'library' && patchLibrary && tokenBindableFields.has(key) && typeof value === 'number') {
            await applyTokenField(node as SceneNode, DIRECT_PROPS[key], value);
          } else {
            (node as any)[DIRECT_PROPS[key]] = value;
          }
        } else if ((key === 'layoutSizingHorizontal' || key === 'layoutSizingVertical') && 'layoutMode' in node) {
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
  assertHandler(node, `Node not found: ${nodeId}`, 'NOT_FOUND');
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

registerHandler('create_frame', async (params) => {
  const name = (params.name as string) ?? 'Frame';
  const width = (params.width as number) ?? 100;
  const height = (params.height as number) ?? 100;

  // ── Library-aware creation: check mode & preload styles ──
  const [createMode, createLibrary] = await getCachedModeLibrary();
  const useLib = createMode === 'library' && !!createLibrary;
  if (useLib) {
    await ensureLoaded(createLibrary!);
  }

  const frame = figma.createFrame();
  frame.name = name;
  frame.resize(width, height);
  if (params.x != null) frame.x = params.x as number;
  if (params.y != null) frame.y = params.y as number;

  // ── Fill: use applyFill for library token/style binding ──
  const libraryBindings: string[] = [];
  if (params.fill && typeof params.fill === 'string') {
    const fillResult = await applyFill(
      frame, params.fill as any, 'background', useLib, createLibrary,
      { stylesPreloaded: true },
    );
    if (fillResult.autoBound) libraryBindings.push(fillResult.autoBound);
  } else if (useLib) {
    // No fill specified — try binding library default for background
    const fillResult = await applyFill(
      frame, undefined, 'background', useLib, createLibrary,
      { stylesPreloaded: true },
    );
    if (fillResult.autoBound) libraryBindings.push(fillResult.autoBound);
  }

  if (params.layoutMode) {
    frame.layoutMode = params.layoutMode as 'HORIZONTAL' | 'VERTICAL';
  }

  // ── Spacing & padding: bind to float tokens in library mode ──
  const tokenFields: Array<[string, string]> = [
    ['itemSpacing', 'itemSpacing'],
    ['paddingLeft', 'paddingLeft'],
    ['paddingRight', 'paddingRight'],
    ['paddingTop', 'paddingTop'],
    ['paddingBottom', 'paddingBottom'],
  ];
  for (const [paramKey, nodeKey] of tokenFields) {
    if (params[paramKey] != null) {
      if (useLib && typeof params[paramKey] === 'number') {
        const bound = await applyTokenField(frame as SceneNode, nodeKey, params[paramKey] as number);
        if (bound) libraryBindings.push(`${nodeKey}:${bound}`);
      } else {
        (frame as any)[nodeKey] = params[paramKey] as number;
      }
    }
  }

  // ── Corner radius: library-aware binding ──
  if (params.cornerRadius != null && typeof params.cornerRadius === 'number') {
    const radiusBound = await applyCornerRadius(frame as SceneNode, params.cornerRadius, useLib);
    libraryBindings.push(...radiusBound);
  }

  if (params.parentId) {
    const parent = await findNodeByIdAsync(params.parentId as string);
    if (parent && 'appendChild' in parent) {
      (parent as FrameNode).appendChild(frame);
    }
  }

  // Set sizing AFTER appendChild
  if (params.layoutSizingHorizontal) {
    (frame as any).layoutSizingHorizontal = params.layoutSizingHorizontal as string;
  }
  if (params.layoutSizingVertical) {
    (frame as any).layoutSizingVertical = params.layoutSizingVertical as string;
  }
  if (params.primaryAxisAlignItems) {
    frame.primaryAxisAlignItems = params.primaryAxisAlignItems as 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
  }
  if (params.counterAxisAlignItems) {
    frame.counterAxisAlignItems = params.counterAxisAlignItems as 'MIN' | 'CENTER' | 'MAX';
  }

  const result = simplifyNode(frame);
  if (libraryBindings.length > 0) {
    (result as unknown as Record<string, unknown>)._libraryBindings = libraryBindings;
  }
  return result;
});

registerHandler('create_text', async (params) => {
  const content = (params.content as string) ?? '';
  const name = (params.name as string) ?? (content || 'Text');
  const fontSize = (params.fontSize as number) ?? 14;
  const fontFamily = (params.fontFamily as string) ?? 'Inter';
  const fontStyle = (params.fontStyle as string) ?? 'Regular';

  // ── Library-aware creation: check mode & preload styles ──
  const [createMode, createLibrary] = await getCachedModeLibrary();
  const useLib = createMode === 'library' && !!createLibrary;
  if (useLib) {
    await ensureLoaded(createLibrary!);
  }

  const fontName = await loadFontWithFallback(fontFamily, fontStyle);

  const text = figma.createText();
  text.fontName = fontName;
  text.name = name;
  text.fontSize = fontSize;
  text.characters = content;

  if (params.x != null) text.x = params.x as number;
  if (params.y != null) text.y = params.y as number;

  // ── Fill: use applyFill for library token/style binding ──
  const libraryBindings: string[] = [];
  if (params.fill && typeof params.fill === 'string') {
    const fillResult = await applyFill(
      text, params.fill as any, 'textColor', useLib, createLibrary,
      { stylesPreloaded: true },
    );
    if (fillResult.autoBound) libraryBindings.push(fillResult.autoBound);
  } else if (useLib) {
    // No fill specified — try binding library default for text color
    const fillResult = await applyFill(
      text, undefined, 'textColor', useLib, createLibrary,
      { stylesPreloaded: true },
    );
    if (fillResult.autoBound) libraryBindings.push(fillResult.autoBound);
  }

  // ── Explicit lineHeight must be set BEFORE typography binding ──
  // so that autoBindTypography can override it with a variable if matched.
  if (params.lineHeight != null) {
    text.lineHeight = { value: params.lineHeight as number, unit: 'PIXELS' };
  }

  // ── Typography: bind fontSize/fontFamily/lineHeight to library tokens ──
  if (useLib) {
    const fontHints = { fontFamily: fontName.family, fontWeight: fontName.style };
    const styleMatch = getTextStyleId(fontSize, fontHints);
    if (styleMatch) {
      try {
        await (text as any).setTextStyleIdAsync(styleMatch.id);
        libraryBindings.push(`textStyle:${styleMatch.name}`);
      } catch { /* skip */ }
    } else {
      try {
        const typoResult = await autoBindTypography(text, fontSize, createLibrary!, {
          skipFontFamily: params.fontFamily !== undefined,
        });
        if (typoResult?.scale) {
          libraryBindings.push(`typo:${typoResult.scale}`);
        }
      } catch { /* skip */ }
    }
  }
  if (params.letterSpacing != null) {
    text.letterSpacing = { value: params.letterSpacing as number, unit: 'PIXELS' };
  }
  if (params.textAlignHorizontal) {
    text.textAlignHorizontal = params.textAlignHorizontal as 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
  }

  if (params.parentId) {
    const parent = await findNodeByIdAsync(params.parentId as string);
    if (parent && 'appendChild' in parent) {
      (parent as FrameNode).appendChild(text);
    }
  }

  const result = simplifyNode(text);
  if (libraryBindings.length > 0) {
    (result as unknown as Record<string, unknown>)._libraryBindings = libraryBindings;
  }
  return result;
});

registerHandler('save_version_history', async (params) => {
  const title = (params.title as string) ?? 'FigCraft checkpoint';
  const description = (params.description as string) ?? '';
  await figma.saveVersionHistoryAsync(title, description);
  return { ok: true, title, description };
});

registerHandler('create_line', async (params) => {
  const line = figma.createLine();
  line.name = (params.name as string) ?? 'Line';
  const length = (params.length as number) ?? 100;
  line.resize(length, 0);
  if (params.x != null) line.x = params.x as number;
  if (params.y != null) line.y = params.y as number;
  if (params.rotation != null) line.rotation = params.rotation as number;

  const [lineMode, lineLibrary] = await getCachedModeLibrary();
  const useLib = lineMode === 'library' && !!lineLibrary;
  const strokeInput = params.stroke ?? '#000000';
  await applyStroke(line, strokeInput as any, (params.strokeWeight as number) ?? 1, useLib, lineLibrary);

  if (params.parentId) {
    const parent = await findNodeByIdAsync(params.parentId as string);
    if (parent && 'appendChild' in parent) {
      (parent as FrameNode).appendChild(line);
    }
  }

  return simplifyNode(line);
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

  return { id: section.id, name: section.name, x: section.x, y: section.y };
});

registerHandler('boolean_operation', async (params) => {
  const nodeIds = params.nodeIds as string[];
  const operation = params.operation as 'UNION' | 'SUBTRACT' | 'INTERSECT' | 'EXCLUDE';

  const resolved = await Promise.all(nodeIds.map((id) => findNodeByIdAsync(id)));
  const nodes = resolved.filter((n): n is SceneNode =>
    n !== null && 'type' in n && n.type !== 'PAGE' && n.type !== 'DOCUMENT',
  );

  assertHandler(nodes.length >= 2, 'boolean_operation requires at least 2 valid nodes');

  const parent = nodes[0].parent as (BaseNode & ChildrenMixin) | null;
  assertHandler(parent, 'Nodes have no parent');

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
