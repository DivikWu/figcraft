/**
 * Selection handlers — programmatic selection and viewport control.
 */

import { registerHandler } from '../registry.js';
import { findNodeByIdAsync } from '../utils/node-lookup.js';

export function registerSelectionHandlers(): void {
  registerHandler('set_selection', async (params) => {
    const nodeIds = params.nodeIds as string[];
    const scrollIntoView = (params.scrollIntoView as boolean) ?? true;

    const resolved: SceneNode[] = [];
    const notFound: string[] = [];

    for (const id of nodeIds) {
      const node = await findNodeByIdAsync(id);
      if (node && node.type !== 'DOCUMENT' && node.type !== 'PAGE' && isDescendantOfCurrentPage(node)) {
        resolved.push(node as SceneNode);
      } else {
        notFound.push(id);
      }
    }

    figma.currentPage.selection = resolved;
    if (scrollIntoView && resolved.length > 0) {
      figma.viewport.scrollAndZoomIntoView(resolved);
    }

    return { ok: true, selectedCount: resolved.length, notFound };
  });
} // registerSelectionHandlers

/** Check if a node is a descendant of the current page. */
function isDescendantOfCurrentPage(node: BaseNode | null): boolean {
  let current = node;
  while (current) {
    if (current.id === figma.currentPage.id) return true;
    current = current.parent;
  }
  return false;
}
