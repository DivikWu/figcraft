/**
 * Image & vector handlers — set image fills, create vectors, flatten nodes.
 */

import { registerHandler } from '../registry.js';
import { simplifyNode } from '../adapters/node-simplifier.js';

export function registerImageVectorHandlers(): void {

registerHandler('set_image_fill', async (params) => {
  const nodeId = params.nodeId as string;
  const imageData = params.imageData as string; // base64-encoded image
  const scaleMode = ((params.scaleMode as string) ?? 'FILL').toUpperCase() as 'FILL' | 'FIT' | 'CROP' | 'TILE';

  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || !('fills' in node)) {
    return { error: `Node not found or does not support fills: ${nodeId}` };
  }

  const bytes = figma.base64Decode(imageData);
  const image = figma.createImage(bytes);

  const imagePaint: ImagePaint = {
    type: 'IMAGE',
    scaleMode,
    imageHash: image.hash,
  };

  (node as GeometryMixin).fills = [imagePaint];
  return { ok: true, imageHash: image.hash };
});

registerHandler('create_vector', async (params) => {
  const svgString = params.svg as string;
  const name = (params.name as string) ?? 'Vector';
  const parentId = params.parentId as string | undefined;

  const vectorNode = figma.createNodeFromSvg(svgString);
  vectorNode.name = name;

  if (params.x != null) vectorNode.x = params.x as number;
  if (params.y != null) vectorNode.y = params.y as number;
  if (params.resize) {
    const [w, h] = params.resize as [number, number];
    vectorNode.resize(w, h);
  }

  if (parentId) {
    const parent = await figma.getNodeByIdAsync(parentId);
    if (parent && 'appendChild' in parent) {
      (parent as FrameNode).appendChild(vectorNode);
    }
  }

  return simplifyNode(vectorNode);
});

registerHandler('flatten_node', async (params) => {
  const nodeId = params.nodeId as string;
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || !('type' in node)) {
    return { error: `Node not found: ${nodeId}` };
  }

  const sceneNode = node as SceneNode;
  const flat = figma.flatten([sceneNode]);
  return simplifyNode(flat);
});

registerHandler('create_star', async (params) => {
  const star = figma.createStar();
  star.name = (params.name as string) ?? 'Star';
  star.resize((params.width as number) ?? 100, (params.height as number) ?? 100);
  if (params.x != null) star.x = params.x as number;
  if (params.y != null) star.y = params.y as number;
  if (params.pointCount != null) star.pointCount = params.pointCount as number;
  if (params.innerRadius != null) star.innerRadius = params.innerRadius as number;

  if (params.fill && typeof params.fill === 'string') {
    const { hexToFigmaRgb } = await import('../utils/color.js');
    star.fills = [{ type: 'SOLID', color: hexToFigmaRgb(params.fill) }];
  }

  if (params.parentId) {
    const parent = await figma.getNodeByIdAsync(params.parentId as string);
    if (parent && 'appendChild' in parent) (parent as FrameNode).appendChild(star);
  }

  return simplifyNode(star);
});

registerHandler('create_polygon', async (params) => {
  const polygon = figma.createPolygon();
  polygon.name = (params.name as string) ?? 'Polygon';
  polygon.resize((params.width as number) ?? 100, (params.height as number) ?? 100);
  if (params.x != null) polygon.x = params.x as number;
  if (params.y != null) polygon.y = params.y as number;
  if (params.pointCount != null) polygon.pointCount = params.pointCount as number;

  if (params.fill && typeof params.fill === 'string') {
    const { hexToFigmaRgb } = await import('../utils/color.js');
    polygon.fills = [{ type: 'SOLID', color: hexToFigmaRgb(params.fill) }];
  }

  if (params.parentId) {
    const parent = await figma.getNodeByIdAsync(params.parentId as string);
    if (parent && 'appendChild' in parent) (parent as FrameNode).appendChild(polygon);
  }

  return simplifyNode(polygon);
});

} // registerImageVectorHandlers
