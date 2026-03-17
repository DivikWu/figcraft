/**
 * Node write handlers — create, update, delete nodes.
 */

import { registerHandler } from '../registry.js';
import { simplifyNode } from '../adapters/node-simplifier.js';
import { hexToFigmaRgb } from '../utils/color.js';
import { autoBindDefault, autoBindTypography, type TypographyBindResult } from '../utils/design-context.js';
import { ensureLoaded, getTextStyleId, getPaintStyleId } from '../utils/style-registry.js';
import { STORAGE_KEYS } from '../constants.js';

const MODE_STORAGE_KEY = STORAGE_KEYS.MODE;
const LIBRARY_STORAGE_KEY = STORAGE_KEYS.LIBRARY;

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
  let maxRight = 0;
  for (const child of children) {
    if (child.id === node.id) continue;
    const box = child.absoluteBoundingBox;
    const right = box ? box.x + box.width : child.x + child.width;
    if (right > maxRight) maxRight = right;
  }
  // Account for other nodes being positioned concurrently in the same tick
  if (_reservedRightEdge !== null && _reservedRightEdge > maxRight) {
    maxRight = _reservedRightEdge;
  }
  node.x = maxRight + 64;
  _reservedRightEdge = node.x + node.width;
}

export function registerWriteNodeHandlers(): void {

registerHandler('create_frame', async (params) => {
  const name = (params.name as string) ?? 'Frame';
  const width = (params.width as number) ?? 100;
  const height = (params.height as number) ?? 100;
  const parentId = params.parentId as string | undefined;
  const mode = (await figma.clientStorage.getAsync(MODE_STORAGE_KEY)) || 'library';
  const library = await figma.clientStorage.getAsync(LIBRARY_STORAGE_KEY) as string | undefined;

  const frame = figma.createFrame();
  frame.name = name;
  frame.resize(width, height);
  if (params.x != null) frame.x = params.x as number;
  if (params.y != null) frame.y = params.y as number;

  if (params.autoLayout) {
    frame.layoutMode = (params.layoutDirection as 'HORIZONTAL' | 'VERTICAL') ?? 'VERTICAL';
    frame.itemSpacing = (params.itemSpacing as number) ?? 0;
    frame.paddingLeft = frame.paddingRight = frame.paddingTop = frame.paddingBottom =
      (params.padding as number) ?? 0;
    if (params.primaryAxisAlignItems) {
      frame.primaryAxisAlignItems = params.primaryAxisAlignItems as 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
    }
    if (params.counterAxisAlignItems) {
      frame.counterAxisAlignItems = params.counterAxisAlignItems as 'MIN' | 'CENTER' | 'MAX';
    }
    // Set sizing modes: FIXED when dimension explicitly provided, AUTO (hug) otherwise.
    const dir = frame.layoutMode;
    if (dir === 'HORIZONTAL') {
      frame.primaryAxisSizingMode = params.width != null ? 'FIXED' : 'AUTO';
      frame.counterAxisSizingMode = params.height != null ? 'FIXED' : 'AUTO';
    } else {
      frame.primaryAxisSizingMode = params.height != null ? 'FIXED' : 'AUTO';
      frame.counterAxisSizingMode = params.width != null ? 'FIXED' : 'AUTO';
    }
    if (params.width != null || params.height != null) {
      frame.resize(width, height);
    }
  }

  let autoBound: string | null = null;

  if (params.fill && typeof params.fill === 'string') {
    frame.fills = [{ type: 'SOLID', color: hexToFigmaRgb(params.fill) }];
    // Try to match a registered Paint Style for this fill
    if (mode === 'library' && library) {
      await ensureLoaded(library);
      const paintMatch = getPaintStyleId(params.fill as string);
      if (paintMatch) {
        try {
          await (frame as any).setFillStyleIdAsync(paintMatch.id);
          autoBound = `fill:${paintMatch.name}`;
        } catch (err) { console.warn('[figcraft] Paint style apply failed:', err); }
      }
    }
  } else {
    // Auto-bind default surface color when no fill specified
    if (mode === 'library' && library) {
      autoBound = await autoBindDefault(frame, 'background', library);
    }
  }

  if (parentId) {
    const parent = await figma.getNodeByIdAsync(parentId);
    if (parent && 'appendChild' in parent) {
      (parent as FrameNode).appendChild(frame);
    }
  } else {
    autoPositionOnPage(frame, params);
  }

  const result = simplifyNode(frame);
  if (autoBound) (result as Record<string, unknown>).autoBound = autoBound;
  return result;
});

registerHandler('create_text', async (params) => {
  const content = (params.content as string) ?? '';
  const fontSize = (params.fontSize as number) ?? 16;
  const fontFamily = (params.fontFamily as string) ?? 'Inter';
  const fontStyle = (params.fontStyle as string) ?? 'Regular';
  const parentId = params.parentId as string | undefined;
  const mode = (await figma.clientStorage.getAsync(MODE_STORAGE_KEY)) || 'library';
  const library = await figma.clientStorage.getAsync(LIBRARY_STORAGE_KEY) as string | undefined;

  const text = figma.createText();
  if (params.x != null) text.x = params.x as number;
  if (params.y != null) text.y = params.y as number;
  await figma.loadFontAsync({ family: fontFamily, style: fontStyle });
  text.fontName = { family: fontFamily, style: fontStyle };
  text.fontSize = fontSize;
  text.characters = content;

  if (params.name) text.name = params.name as string;

  let autoBound: string | null = null;

  if (params.fill && typeof params.fill === 'string') {
    text.fills = [{ type: 'SOLID', color: hexToFigmaRgb(params.fill) }];
  } else {
    // Auto-bind default text color when no fill specified
    if (mode === 'library' && library) {
      autoBound = await autoBindDefault(text, 'textColor', library);
    }
  }

  // Auto-bind typography: Style first, then Variables fallback
  let typoResult: TypographyBindResult | null = null;
  let typoStyle: string | null = null;
  {
    if (mode === 'library' && library) {
      await ensureLoaded(library);

      // 1. Try registered Text Style (memory lookup, 0ms)
      const styleMatch = getTextStyleId(fontSize);
      if (styleMatch) {
        try {
          await (text as any).setTextStyleIdAsync(styleMatch.id);
          typoStyle = `style:${styleMatch.name}`;
        } catch (err) { console.warn('[figcraft] Text style apply failed:', err); }
      }

      // 2. Fallback to Typography Variables
      if (!typoStyle) {
        const skipFontFamily = params.fontFamily !== undefined;
        typoResult = await autoBindTypography(text, fontSize, library, { skipFontFamily });
      }
    }
  }

  if (parentId) {
    const parent = await figma.getNodeByIdAsync(parentId);
    if (parent && 'appendChild' in parent) {
      (parent as FrameNode).appendChild(text);
    }
  } else {
    autoPositionOnPage(text, params);
  }

  const result = simplifyNode(text);
  const autoBoundInfo: Record<string, unknown> = {};
  if (autoBound) autoBoundInfo.color = autoBound;
  if (typoStyle) {
    autoBoundInfo.typography = typoStyle;
  } else if (typoResult) {
    autoBoundInfo.typography = typoResult.scale;
    if (!typoResult.exact) autoBoundInfo.typographyHint = typoResult.hint;
  }
  if (Object.keys(autoBoundInfo).length > 0) (result as Record<string, unknown>).autoBound = autoBoundInfo;
  return result;
});

registerHandler('set_text_content', async (params) => {
  const nodeId = params.nodeId as string;
  const content = params.content as string;

  const node = await figma.getNodeByIdAsync(nodeId);
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
  const patchMode = (await figma.clientStorage.getAsync(MODE_STORAGE_KEY)) || 'library';
  const patchLibrary = await figma.clientStorage.getAsync(LIBRARY_STORAGE_KEY) as string | undefined;
  if (patchMode === 'library' && patchLibrary) {
    await ensureLoaded(patchLibrary);
  }

  const results: Array<{ nodeId: string; ok: boolean; error?: string }> = [];

  for (const patch of patches) {
    try {
      const node = await figma.getNodeByIdAsync(patch.nodeId);
      if (!node) {
        results.push({ nodeId: patch.nodeId, ok: false, error: 'Node not found' });
        continue;
      }

      for (const [key, value] of Object.entries(patch.props)) {
        if (key === 'x' || key === 'y') {
          (node as SceneNode)[key] = value as number;
        } else if (key === 'name') {
          node.name = value as string;
        } else if (key === 'visible') {
          (node as SceneNode).visible = value as boolean;
        } else if (key === 'opacity') {
          (node as SceneNode & BlendMixin).opacity = value as number;
        } else if (key === 'cornerRadius' && 'cornerRadius' in node) {
          (node as RectangleNode).cornerRadius = value as number;
        } else if (key === 'resize' && 'resize' in node) {
          const [w, h] = value as [number, number];
          (node as FrameNode).resize(w, h);
        } else if (key === 'fills' && 'fills' in node) {
          if (typeof value === 'string') {
            (node as GeometryMixin).fills = [{ type: 'SOLID', color: hexToFigmaRgb(value) }];
            // Try to match a registered Paint Style (mode/library hoisted above loop)
            if (patchMode === 'library' && patchLibrary) {
              const paintMatch = getPaintStyleId(value);
              if (paintMatch) {
                try { (node as any).fillStyleId = paintMatch.id; } catch { /* skip */ }
              }
            }
          }
        } else if (key === 'itemSpacing' && 'itemSpacing' in node) {
          (node as FrameNode).itemSpacing = value as number;
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
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) return { error: `Node not found: ${nodeId}` };
  node.remove();
  return { ok: true };
});

registerHandler('clone_node', async (params) => {
  const nodeId = params.nodeId as string;
  const node = await figma.getNodeByIdAsync(nodeId);
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

  const parent = await figma.getNodeByIdAsync(parentId);
  const child = await figma.getNodeByIdAsync(childId);

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
  type: 'frame' | 'text';
  name?: string;
  props?: Record<string, unknown>;
  children?: NodeSpec[];
}

/** Library context passed through the recursive tree to avoid repeated storage reads. */
interface LibraryCtx {
  mode: string;
  library: string | undefined;
}

async function createNodeFromSpec(spec: NodeSpec, parentNode: BaseNode | undefined, ctx: LibraryCtx): Promise<SceneNode> {
  const useLibrary = ctx.mode === 'library' && !!ctx.library;

  if (spec.type === 'frame') {
    const frame = figma.createFrame();
    const p = spec.props ?? {};
    frame.name = (spec.name as string) ?? 'Frame';
    frame.resize((p.width as number) ?? 100, (p.height as number) ?? 100);
    if (p.x != null) frame.x = p.x as number;
    if (p.y != null) frame.y = p.y as number;
    if (p.fill && typeof p.fill === 'string') {
      frame.fills = [{ type: 'SOLID', color: hexToFigmaRgb(p.fill as string) }];
      // Match registered Paint Style
      if (useLibrary) {
        const paintMatch = getPaintStyleId(p.fill as string);
        if (paintMatch) {
          try { await (frame as any).setFillStyleIdAsync(paintMatch.id); } catch { /* skip */ }
        }
      }
    } else if (useLibrary) {
      // Auto-bind default surface color
      try { await autoBindDefault(frame, 'background', ctx.library!); } catch { /* skip */ }
    }
    if (p.cornerRadius != null) frame.cornerRadius = p.cornerRadius as number;
    if (p.autoLayout) {
      frame.layoutMode = (p.layoutDirection as 'HORIZONTAL' | 'VERTICAL') ?? 'VERTICAL';
      frame.itemSpacing = (p.itemSpacing as number) ?? 0;
      frame.paddingLeft = frame.paddingRight = frame.paddingTop = frame.paddingBottom =
        (p.padding as number) ?? 0;
    }
    if (parentNode && 'appendChild' in parentNode) {
      (parentNode as FrameNode).appendChild(frame);
    }
    // Recursively create children
    if (spec.children) {
      for (const child of spec.children) {
        await createNodeFromSpec(child, frame, ctx);
      }
    }
    return frame;
  } else {
    // text
    const p = spec.props ?? {};
    const fontFamily = (p.fontFamily as string) ?? 'Inter';
    const fontStyle = (p.fontStyle as string) ?? 'Regular';
    const fontSize = (p.fontSize as number) ?? 16;
    const text = figma.createText();
    await figma.loadFontAsync({ family: fontFamily, style: fontStyle });
    text.fontName = { family: fontFamily, style: fontStyle };
    text.fontSize = fontSize;
    text.characters = (p.content as string) ?? '';
    if (spec.name) text.name = spec.name;
    if (p.fill && typeof p.fill === 'string') {
      text.fills = [{ type: 'SOLID', color: hexToFigmaRgb(p.fill as string) }];
    } else if (useLibrary) {
      // Auto-bind default text color
      try { await autoBindDefault(text, 'textColor', ctx.library!); } catch { /* skip */ }
    }
    // Auto-bind typography
    if (useLibrary) {
      const styleMatch = getTextStyleId(fontSize);
      if (styleMatch) {
        try { await (text as any).setTextStyleIdAsync(styleMatch.id); } catch { /* skip */ }
      } else {
        try {
          const skipFontFamily = p.fontFamily !== undefined;
          await autoBindTypography(text, fontSize, ctx.library!, { skipFontFamily });
        } catch { /* skip */ }
      }
    }
    if (parentNode && 'appendChild' in parentNode) {
      (parentNode as FrameNode).appendChild(text);
    }
    return text;
  }
}

registerHandler('create_document', async (params) => {
  const nodes = params.nodes as NodeSpec[];
  const parentId = params.parentId as string | undefined;
  const docMode = (await figma.clientStorage.getAsync(MODE_STORAGE_KEY)) || 'library';
  const docLibrary = await figma.clientStorage.getAsync(LIBRARY_STORAGE_KEY) as string | undefined;
  const ctx: LibraryCtx = { mode: docMode, library: docLibrary };

  if (docMode === 'library' && docLibrary) {
    await ensureLoaded(docLibrary);
  }

  let parent: BaseNode | undefined;
  if (parentId) {
    const found = await figma.getNodeByIdAsync(parentId);
    if (found) parent = found;
  }

  const created: Array<{ id: string; name: string; type: string }> = [];
  for (const spec of nodes) {
    const node = await createNodeFromSpec(spec, parent, ctx);
    created.push({ id: node.id, name: node.name, type: node.type });
    if (!parent) {
      // Auto-position top-level nodes
      autoPositionOnPage(node, spec.props ?? {});
    }
  }

  return { ok: true, created };
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
      const child = await figma.getNodeByIdAsync(id);
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

} // registerWriteNodeHandlers
