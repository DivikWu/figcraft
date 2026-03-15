/**
 * Node write handlers — create, update, delete nodes.
 */

import { registerHandler } from '../code.js';
import { simplifyNode } from '../adapters/node-simplifier.js';
import { hexToFigmaRgba } from '../utils/color.js';

registerHandler('create_frame', async (params) => {
  const name = (params.name as string) ?? 'Frame';
  const width = (params.width as number) ?? 100;
  const height = (params.height as number) ?? 100;
  const parentId = params.parentId as string | undefined;

  const frame = figma.createFrame();
  frame.name = name;
  frame.resize(width, height);

  if (params.autoLayout) {
    frame.layoutMode = (params.layoutDirection as 'HORIZONTAL' | 'VERTICAL') ?? 'VERTICAL';
    frame.itemSpacing = (params.itemSpacing as number) ?? 0;
    frame.paddingLeft = frame.paddingRight = frame.paddingTop = frame.paddingBottom =
      (params.padding as number) ?? 0;
  }

  if (params.fill && typeof params.fill === 'string') {
    frame.fills = [{ type: 'SOLID', color: hexToFigmaRgba(params.fill) }];
  }

  if (parentId) {
    const parent = figma.getNodeById(parentId);
    if (parent && 'appendChild' in parent) {
      (parent as FrameNode).appendChild(frame);
    }
  }

  return simplifyNode(frame);
});

registerHandler('create_text', async (params) => {
  const content = (params.content as string) ?? '';
  const fontSize = (params.fontSize as number) ?? 16;
  const fontFamily = (params.fontFamily as string) ?? 'Inter';
  const fontStyle = (params.fontStyle as string) ?? 'Regular';
  const parentId = params.parentId as string | undefined;

  const text = figma.createText();
  await figma.loadFontAsync({ family: fontFamily, style: fontStyle });
  text.fontName = { family: fontFamily, style: fontStyle };
  text.fontSize = fontSize;
  text.characters = content;

  if (params.name) text.name = params.name as string;

  if (params.fill && typeof params.fill === 'string') {
    text.fills = [{ type: 'SOLID', color: hexToFigmaRgba(params.fill) }];
  }

  if (parentId) {
    const parent = figma.getNodeById(parentId);
    if (parent && 'appendChild' in parent) {
      (parent as FrameNode).appendChild(text);
    }
  }

  return simplifyNode(text);
});

registerHandler('set_text_content', async (params) => {
  const nodeId = params.nodeId as string;
  const content = params.content as string;

  const node = figma.getNodeById(nodeId);
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

  const results: Array<{ nodeId: string; ok: boolean; error?: string }> = [];

  for (const patch of patches) {
    try {
      const node = figma.getNodeById(patch.nodeId);
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
            (node as GeometryMixin).fills = [{ type: 'SOLID', color: hexToFigmaRgba(value) }];
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
  const node = figma.getNodeById(nodeId);
  if (!node) return { error: `Node not found: ${nodeId}` };
  node.remove();
  return { ok: true };
});

registerHandler('clone_node', async (params) => {
  const nodeId = params.nodeId as string;
  const node = figma.getNodeById(nodeId);
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

  const parent = figma.getNodeById(parentId);
  const child = figma.getNodeById(childId);

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
