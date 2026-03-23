/**
 * Robust node lookup with fallback tree walk.
 *
 * `figma.getNodeByIdAsync` can return null for recently created nodes
 * (especially those created in batch via create_document). This utility
 * falls back to walking `figma.currentPage.children` when the fast
 * lookup misses.
 */

/** Walk a subtree looking for a node by ID. */
function walkForNode(parent: ChildrenMixin, id: string): SceneNode | null {
  for (const child of parent.children) {
    if (child.id === id) return child;
    if ('children' in child) {
      const found = walkForNode(child as unknown as ChildrenMixin, id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Find a node by ID, falling back to a page tree walk if the fast
 * index-based lookup returns null.
 */
export async function findNodeByIdAsync(id: string): Promise<BaseNode | null> {
  const node = await figma.getNodeByIdAsync(id);
  if (node) return node;

  // Fallback: walk current page tree
  return walkForNode(figma.currentPage, id);
}
