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

// ─── Cross-page safety guards ───

/** Walk up the tree to find the containing Page node. */
export function getContainingPage(node: BaseNode): PageNode | null {
  let current: BaseNode | null = node;
  while (current) {
    if (current.type === 'PAGE') return current as PageNode;
    current = current.parent;
  }
  return null;
}

/**
 * Assert that a node belongs to the current page.
 * Throws with `code: 'CROSS_PAGE'` if the node is on a different page.
 * Silently passes if the page cannot be determined (e.g. detached nodes).
 */
export function assertOnCurrentPage(node: BaseNode, nodeId: string): void {
  const page = getContainingPage(node);
  if (page && page.id !== figma.currentPage.id) {
    throw Object.assign(
      new Error(
        `Node ${nodeId} is on page "${page.name}", not current page "${figma.currentPage.name}". Cross-page write refused.`,
      ),
      { code: 'CROSS_PAGE' },
    );
  }
}
