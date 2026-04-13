/**
 * Node logic functions — extracted from nodes.ts server.tool() callbacks.
 * Used by endpoint tools for get/list operations.
 */

import { Bridge } from '../../bridge.js';
import { extractFileKeyFromUrl, extractNodeIdFromUrl } from '../../figma-api.js';
import { requestWithFallback, restGetNodeInfo, setFileKey } from '../../rest-fallback.js';

/** Standard MCP response type shared by all logic functions. */
export type McpResponse = {
  content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>;
  isError?: boolean;
};

export async function getNodeInfoLogic(
  bridge: Bridge,
  params: { nodeId: string; detail?: string; maxDepth?: number },
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
        content: [
          {
            type: 'text' as const,
            text: 'Could not extract node ID from the Figma URL. Please include ?node-id= in the URL.',
          },
        ],
      };
    }
  }

  const bridgeParams: Record<string, unknown> = { nodeId: resolvedNodeId };
  if (params.detail) bridgeParams.detail = params.detail;
  if (params.maxDepth != null) bridgeParams.maxDepth = params.maxDepth;

  const { result, source } = await requestWithFallback(bridge, 'get_node_info', bridgeParams, () =>
    restGetNodeInfo(resolvedNodeId),
  );

  // If node not found, guide agent to the correct workflow
  const resultObj = result as Record<string, unknown>;
  if (resultObj?.error && String(resultObj.error).includes('not found')) {
    return {
      content: [
        { type: 'text' as const, text: JSON.stringify(result, null, 2) },
        {
          type: 'text' as const,
          text: '\n⚠️ Node not found. Verify the node ID is correct. Use get_current_page(maxDepth=2) to browse the page tree, or nodes(method: "list") to search by name.',
        },
      ],
    };
  }

  // Guard against oversized responses
  const guarded = Bridge.guardResponseSize(result, 'get_node_info', [
    'Use get_current_page(maxDepth=1) for a lightweight overview first',
    'Use detail="summary" for tree browsing, detail="full" for editing',
    'Inspect specific child nodes with nodes(method: "get") instead of the full subtree',
  ]);

  const text =
    source === 'rest-api'
      ? JSON.stringify(guarded) +
        '\n\n⚠️ Data from REST API (plugin offline). Variable bindings and some properties may be missing.'
      : JSON.stringify(guarded);
  return { content: [{ type: 'text' as const, text }] };
}

export async function getCurrentPageLogic(
  bridge: Bridge,
  params: { maxNodes?: number; maxDepth?: number; detail?: string },
): Promise<McpResponse> {
  // Pass detail + degradeDepth to plugin: auto-degrade deep children to summary for large trees
  const detail = params.detail ?? 'standard';
  const maxDepth = params.maxDepth;
  const degradeDepth = maxDepth != null && maxDepth >= 2 ? Math.max(1, maxDepth - 1) : undefined;
  const result = (await bridge.request('get_current_page', {
    maxNodes: params.maxNodes,
    maxDepth,
    detail,
    degradeDepth,
  })) as Record<string, unknown>;
  const guarded = Bridge.guardResponseSize(result, 'get_current_page', [
    'Use maxDepth=1 for a fast overview of top-level frames',
    'Use detail="summary" for tree browsing, detail="full" for editing',
    'Use nodes(method: "get") on specific nodes for full details',
    'Use maxNodes to limit the number of top-level children returned',
  ]);
  const raw = guarded as Record<string, unknown>;
  const isEmpty =
    !raw._error &&
    (typeof raw.childCount === 'number'
      ? raw.childCount === 0
      : Array.isArray(raw.nodes)
        ? (raw.nodes as unknown[]).length === 0
        : false);
  const nextHint = isEmpty
    ? '\n⚡ IMMEDIATE: Page is empty — call get_mode NOW in this same turn. Do NOT stop or reply to the user yet.'
    : '\n⚡ NEXT: Use nodes(method: "get") on specific nodes for detailed inspection. Use lint_fix_all to check design compliance. Use audit_node for deep quality review of a specific element.';

  return {
    content: [
      { type: 'text' as const, text: JSON.stringify(guarded) },
      { type: 'text' as const, text: nextHint },
    ],
  };
}

export async function searchNodesLogic(
  bridge: Bridge,
  params: { query: string; types?: string[]; limit?: number },
): Promise<McpResponse> {
  const result = await bridge.request('search_nodes', {
    query: params.query,
    types: params.types,
    limit: params.limit,
    detail: 'summary',
  });
  const guarded = Bridge.guardResponseSize(result, 'search_nodes', [
    'Use a more specific query to narrow results',
    'Use the limit parameter to cap the number of results',
    'Use types filter to only return specific node types',
  ]);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(guarded) }],
  };
}
