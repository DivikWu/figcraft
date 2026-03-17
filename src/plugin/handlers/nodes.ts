/**
 * Node read handlers — read node tree, selection, search.
 */

import { registerHandler } from '../registry.js';
import { simplifyNode, simplifyPage } from '../adapters/node-simplifier.js';

export function registerNodeHandlers(): void {

registerHandler('get_node_info', async (params) => {
  const nodeId = params.nodeId as string;
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || !('type' in node) || node.type === 'PAGE' || node.type === 'DOCUMENT') {
    return { error: `Node not found: ${nodeId}` };
  }
  return simplifyNode(node as SceneNode);
});

registerHandler('get_current_page', async (params) => {
  const maxNodes = (params.maxNodes as number) ?? 200;
  const page = figma.currentPage;
  return {
    id: page.id,
    name: page.name,
    childCount: page.children.length,
    nodes: simplifyPage(page, maxNodes),
  };
});

registerHandler('get_document_info', async () => {
  return {
    name: figma.root.name,
    currentPage: figma.currentPage.name,
    pages: figma.root.children.map((p) => ({
      id: p.id,
      name: p.name,
      childCount: p.children.length,
    })),
  };
});

registerHandler('get_selection', async () => {
  const selection = figma.currentPage.selection;
  return {
    count: selection.length,
    nodes: selection.map((n) => simplifyNode(n)),
  };
});

registerHandler('search_nodes', async (params) => {
  const query = (params.query as string).toLowerCase();
  const types = params.types as string[] | undefined;
  const limit = (params.limit as number) ?? 50;

  const results: ReturnType<typeof simplifyNode>[] = [];

  function walk(node: SceneNode): boolean {
    if (results.length >= limit) return true;

    const matchesType = !types || types.includes(node.type);
    const matchesName = node.name.toLowerCase().includes(query);

    if (matchesType && matchesName) {
      results.push(simplifyNode(node, 0));
    }

    if ('children' in node) {
      for (const child of (node as ChildrenMixin).children) {
        if (walk(child)) return true;
      }
    }
    return false;
  }

  for (const child of figma.currentPage.children) {
    if (walk(child)) break;
  }

  return { count: results.length, nodes: results };
});

registerHandler('list_fonts', async (params) => {
  const fonts = await figma.listAvailableFontsAsync();
  const family = params.family as string | undefined;
  if (family) {
    const styles = fonts
      .filter((f) => f.fontName.family === family)
      .map((f) => f.fontName.style);
    return { family, styles, count: styles.length };
  }
  const families = [...new Set(fonts.map((f) => f.fontName.family))].sort();
  return { families, total: families.length };
});

} // registerNodeHandlers
