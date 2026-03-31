/**
 * Node write handlers — shared utilities + patch, delete, clone, reparent.
 *
 * Creation handlers split into:
 *   write-nodes-create.ts   — create_frame, create_text
 *   write-nodes-instance.ts — create_instance, create_instances, misc creation
 */

import { registerHandler } from '../registry.js';
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

// ─── Clone nodes ───
registerHandler('clone_nodes', async (params) => {
  const items = params.items as Array<{ id: string; name?: string; parentId?: string; x?: number; y?: number }>;
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const item of items) {
    try {
      const node = await findNodeByIdAsync(item.id);
      assertHandler(node, `Node not found: ${item.id}`, 'NOT_FOUND');
      const clone = (node as SceneNode).clone();
      if (item.name) clone.name = item.name;
      if (item.x != null) clone.x = item.x;
      if (item.y != null) clone.y = item.y;
      if (item.parentId) {
        const parent = await findNodeByIdAsync(item.parentId);
        if (parent && 'appendChild' in parent) {
          (parent as FrameNode).appendChild(clone);
        }
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
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const item of items) {
    try {
      const node = await findNodeByIdAsync(item.id);
      assertHandler(node, `Node not found: ${item.id}`, 'NOT_FOUND');
      const parent = await findNodeByIdAsync(item.parentId);
      assertHandler(parent && 'appendChild' in parent, `Parent not found or not a container: ${item.parentId}`, 'NOT_FOUND');
      if (item.index != null) {
        (parent as FrameNode).insertChild(item.index, node as SceneNode);
      } else {
        (parent as FrameNode).appendChild(node as SceneNode);
      }
      results.push({ id: item.id, ok: true });
    } catch (err) {
      results.push({ id: item.id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { results };
});

} // registerWriteNodeHandlers
