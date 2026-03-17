/**
 * Annotation handlers — read and write Figma annotations on nodes.
 */

import { registerHandler } from '../registry.js';

type AnnotatedNode = SceneNode & { annotations: Array<{ label: string; properties: Array<{ type: string }> }> };

function hasAnnotations(node: SceneNode): node is AnnotatedNode {
  return 'annotations' in node;
}

export function registerAnnotationHandlers(): void {

registerHandler('get_annotations', async (params) => {
  const results: Array<{ nodeId: string; nodeName: string; annotations: unknown[] }> = [];

  function walk(node: SceneNode): void {
    if (hasAnnotations(node) && node.annotations.length > 0) {
      results.push({ nodeId: node.id, nodeName: node.name, annotations: node.annotations });
    }
    if ('children' in node) {
      for (const child of (node as ChildrenMixin).children) {
        walk(child);
      }
    }
  }

  if (params.nodeId) {
    const node = await figma.getNodeByIdAsync(params.nodeId as string);
    if (!node) return { nodes: [], count: 0 };
    if ('children' in node) {
      for (const child of (node as ChildrenMixin).children) {
        walk(child as SceneNode);
      }
    }
    if (hasAnnotations(node as SceneNode) && (node as AnnotatedNode).annotations.length > 0) {
      results.unshift({ nodeId: node.id, nodeName: (node as SceneNode).name, annotations: (node as AnnotatedNode).annotations });
    }
  } else {
    for (const child of figma.currentPage.children) {
      walk(child);
    }
  }

  return { nodes: results, count: results.length };
});

registerHandler('set_annotation', async (params) => {
  const node = await figma.getNodeByIdAsync(params.nodeId as string);
  if (!node) throw new Error(`Node not found: ${params.nodeId}`);
  if (!hasAnnotations(node as SceneNode)) throw new Error(`Node ${params.nodeId} does not support annotations`);
  const annotated = node as AnnotatedNode;
  const entry = { label: params.label as string, properties: [{ type: 'design' }] };
  annotated.annotations = params.replace ? [entry] : [...annotated.annotations, entry];
  return { ok: true, nodeId: node.id, count: annotated.annotations.length };
});

registerHandler('set_multiple_annotations', async (params) => {
  const items = params.items as Array<{ nodeId: string; label: string; replace?: boolean }>;
  const results = await Promise.allSettled(
    items.map(async (item) => {
      const node = await figma.getNodeByIdAsync(item.nodeId);
      if (!node) throw new Error(`Node ${item.nodeId} not found`);
      if (!hasAnnotations(node as SceneNode)) throw new Error(`Node ${item.nodeId} does not support annotations`);
      const annotated = node as AnnotatedNode;
      const entry = { label: item.label, properties: [{ type: 'design' }] };
      annotated.annotations = item.replace ? [entry] : [...annotated.annotations, entry];
      return { nodeId: item.nodeId, ok: true };
    }),
  );
  return {
    succeeded: results.filter((r) => r.status === 'fulfilled').length,
    failed: results.filter((r) => r.status === 'rejected').length,
    results: results.map((r) =>
      r.status === 'fulfilled' ? r.value : { ok: false, error: (r.reason as Error).message },
    ),
  };
});

} // registerAnnotationHandlers
