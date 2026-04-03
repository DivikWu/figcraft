/**
 * Node read handlers — read node tree, selection, search.
 */

import type { SimplifyDetail } from '../adapters/node-simplifier.js';
import { createContext, simplifyNode, simplifyPage } from '../adapters/node-simplifier.js';
import { registerHandler } from '../registry.js';
import { assertHandler } from '../utils/handler-error.js';
import { findNodeByIdAsync } from '../utils/node-lookup.js';

export function registerNodeHandlers(): void {
  registerHandler('get_node_info', async (params) => {
    const nodeId = params.nodeId as string;
    const detail = (params.detail as SimplifyDetail | undefined) ?? 'full';
    const node = await findNodeByIdAsync(nodeId);
    assertHandler(
      node && 'type' in node && node.type !== 'PAGE' && node.type !== 'DOCUMENT',
      `Node not found: ${nodeId}`,
      'NOT_FOUND',
    );
    return simplifyNode(node as SceneNode, 0, undefined, createContext(undefined, undefined, detail));
  });

  registerHandler('get_node_info_batch', async (params) => {
    const nodeIds = params.nodeIds as string[];
    const detail = (params.detail as SimplifyDetail | undefined) ?? 'standard';
    const _ctx = createContext(undefined, undefined, detail);
    const results: Array<{ id: string; ok: boolean; node?: ReturnType<typeof simplifyNode>; error?: string }> = [];

    for (const nodeId of nodeIds) {
      try {
        const node = await findNodeByIdAsync(nodeId);
        if (!node || !('type' in node) || node.type === 'PAGE' || node.type === 'DOCUMENT') {
          results.push({ id: nodeId, ok: false, error: `Node not found: ${nodeId}` });
        } else {
          results.push({
            id: nodeId,
            ok: true,
            node: simplifyNode(node as SceneNode, 0, undefined, createContext(undefined, undefined, detail)),
          });
        }
      } catch (err) {
        results.push({ id: nodeId, ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return { count: results.length, nodes: results };
  });

  registerHandler('get_current_page', async (params) => {
    const maxNodes = (params.maxNodes as number) ?? 200;
    const maxDepth = (params.maxDepth as number | undefined) ?? 3;
    const detail = (params.detail as SimplifyDetail | undefined) ?? 'standard';
    const degradeDepth = params.degradeDepth as number | undefined;
    const page = figma.currentPage;
    const nodes = simplifyPage(page, maxNodes, maxDepth, undefined, detail, degradeDepth);
    return {
      id: page.id,
      name: page.name,
      childCount: page.children.length,
      returnedNodes: nodes.length,
      ...(nodes.length < page.children.length ? { truncated: true } : {}),
      nodes,
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
    const detail = (params.detail as SimplifyDetail | undefined) ?? 'summary';
    const _ctx = createContext(undefined, undefined, detail);

    const results: ReturnType<typeof simplifyNode>[] = [];

    function walk(node: SceneNode): boolean {
      if (results.length >= limit) return true;

      const matchesType = !types || types.includes(node.type);
      const matchesName = node.name.toLowerCase().includes(query);

      if (matchesType && matchesName) {
        results.push(simplifyNode(node, 0, undefined, createContext(undefined, undefined, detail)));
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
      const styles = fonts.filter((f) => f.fontName.family === family).map((f) => f.fontName.style);
      return { family, styles, count: styles.length };
    }
    const families = [...new Set(fonts.map((f) => f.fontName.family))].sort();
    return { families, total: families.length };
  });

  registerHandler('get_reactions', async (params) => {
    const results: Array<{ nodeId: string; nodeName: string; reactions: unknown[] }> = [];

    function walk(node: SceneNode): void {
      if ('reactions' in node && (node as unknown as { reactions: unknown[] }).reactions.length > 0) {
        results.push({
          nodeId: node.id,
          nodeName: node.name,
          reactions: (node as unknown as { reactions: unknown[] }).reactions,
        });
      }
      if ('children' in node) {
        for (const child of (node as ChildrenMixin).children) {
          walk(child);
        }
      }
    }

    if (params.nodeId) {
      const node = await findNodeByIdAsync(params.nodeId as string);
      if (!node) return { nodes: [], count: 0 };
      walk(node as SceneNode);
    } else {
      figma.currentPage.children.forEach(walk);
    }

    return { nodes: results, count: results.length };
  });
} // registerNodeHandlers
