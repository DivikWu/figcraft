/**
 * Node logic functions — extracted from nodes.ts server.tool() callbacks.
 * Used by endpoint tools for get/list operations.
 */

import { Bridge } from '../../bridge.js';
import {
  requestWithFallback,
  restGetNodeInfo,
} from '../../rest-fallback.js';
import { extractFileKeyFromUrl, extractNodeIdFromUrl } from '../../figma-api.js';
import { setFileKey } from '../../rest-fallback.js';

/** Standard MCP response type shared by all logic functions. */
export type McpResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

export async function getNodeInfoLogic(
  bridge: Bridge,
  params: { nodeId: string },
): Promise<McpResponse> {
  let resolvedNodeId = params.nodeId;

  // Support Figma URLs: extract fileKey + nodeId automatically
  if (resolvedNodeId.includes('figma.com/')) {
    const urlFileKey = extractFileKeyFromUrl(resolvedNodeId);
    const urlNodeId = extractNodeIdFromUrl(resolvedNodeId);
    if (urlFileKey) {
      setFileKey(urlFileKey);
    }
    if (urlNodeId) {
      resolvedNodeId = urlNodeId;
    } else {
      return {
        content: [{ type: 'text' as const, text: 'Could not extract node ID from the Figma URL. Please include ?node-id= in the URL.' }],
      };
    }
  }

  const { result, source } = await requestWithFallback(
    bridge,
    'get_node_info',
    { nodeId: resolvedNodeId },
    () => restGetNodeInfo(resolvedNodeId),
  );

  // If node not found, guide agent to the correct workflow
  const resultObj = result as Record<string, unknown>;
  if (resultObj?.error && String(resultObj.error).includes('not found')) {
    return {
      content: [
        { type: 'text' as const, text: JSON.stringify(result, null, 2) },
        { type: 'text' as const, text: '\n⚠️ Node not found. Verify the node ID is correct. Use get_current_page(maxDepth=2) to browse the page tree, or nodes(method: "list") to search by name.' },
      ],
    };
  }

  // Guard against oversized responses
  const guarded = Bridge.guardResponseSize(result, 'get_node_info', [
    'Use get_current_page(maxDepth=1) for a lightweight overview first',
    'Inspect specific child nodes with nodes(method: "get") instead of the full subtree',
  ]);

  const text = source === 'rest-api'
    ? JSON.stringify(guarded, null, 2) + '\n\n⚠️ Data from REST API (plugin offline). Variable bindings and some properties may be missing.'
    : JSON.stringify(guarded, null, 2);
  return { content: [{ type: 'text' as const, text }] };
}


export async function getCurrentPageLogic(
  bridge: Bridge,
  params: { maxNodes?: number; maxDepth?: number },
): Promise<McpResponse> {
  const result = await bridge.request('get_current_page', { maxNodes: params.maxNodes, maxDepth: params.maxDepth }) as Record<string, unknown>;
  const guarded = Bridge.guardResponseSize(result, 'get_current_page', [
    'Use maxDepth=1 for a fast overview of top-level frames',
    'Use maxDepth=2 to see one level of children',
    'Use nodes(method: "get") on specific nodes for full details',
    'Use maxNodes to limit the number of top-level children returned',
  ]);
  return {
    content: [
      { type: 'text' as const, text: JSON.stringify(guarded, null, 2) },
      { type: 'text' as const, text: '\n⚡ NEXT: Use nodes(method: "get") on specific nodes for detailed inspection. Use lint_fix_all to check design compliance. Use audit_node for deep quality review of a specific element.' },
    ],
  };
}

export async function searchNodesLogic(
  bridge: Bridge,
  params: { query: string; types?: string[]; limit?: number },
): Promise<McpResponse> {
  const result = await bridge.request('search_nodes', { query: params.query, types: params.types, limit: params.limit });
  const guarded = Bridge.guardResponseSize(result, 'search_nodes', [
    'Use a more specific query to narrow results',
    'Use the limit parameter to cap the number of results',
    'Use types filter to only return specific node types',
  ]);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(guarded, null, 2) }],
  };
}
