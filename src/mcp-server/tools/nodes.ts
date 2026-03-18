/**
 * Node read tools — MCP wrappers that bridge to Plugin handlers.
 * Supports REST API fallback for get_node_info and get_document_info
 * when the plugin is offline but an API token is available.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';
import {
  requestWithFallback,
  restGetNodeInfo,
  restGetDocumentInfo,
  setFileKey,
  getFileContext,
} from '../rest-fallback.js';
import { extractFileKeyFromUrl, extractNodeIdFromUrl } from '../figma-api.js';

export function registerNodeTools(server: McpServer, bridge: Bridge): void {
  server.tool(
    'get_node_info',
    'Get detailed information about a specific Figma node by ID, ' +
      'including layout, styles, variable bindings, and children.',
    {
      nodeId: z.string().describe('The Figma node ID (e.g. "1:23")'),
    },
    async ({ nodeId }) => {
      // Support Figma URLs: extract fileKey + nodeId automatically
      let resolvedNodeId = nodeId;
      if (nodeId.includes('figma.com/')) {
        const urlFileKey = extractFileKeyFromUrl(nodeId);
        const urlNodeId = extractNodeIdFromUrl(nodeId);
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
      const text = source === 'rest-api'
        ? JSON.stringify(result, null, 2) + '\n\n⚠️ Data from REST API (plugin offline). Variable bindings and some properties may be missing.'
        : JSON.stringify(result, null, 2);
      return { content: [{ type: 'text' as const, text }] };
    },
  );

  server.tool(
    'get_current_page',
    'Get the current page node tree (compressed). ' +
      'Returns page info and up to maxNodes top-level children with full style data.',
    {
      maxNodes: z
        .number()
        .optional()
        .describe('Maximum number of top-level nodes to return (default: 200)'),
    },
    async ({ maxNodes }) => {
      const result = await bridge.request('get_current_page', { maxNodes });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    'get_document_info',
    'Get document overview: name, current page, and list of all pages.',
    {},
    async () => {
      const { result, source } = await requestWithFallback(
        bridge,
        'get_document_info',
        {},
        () => restGetDocumentInfo(),
      );
      const text = source === 'rest-api'
        ? JSON.stringify(result, null, 2) + '\n\n⚠️ Data from REST API (plugin offline). Current page info unavailable.'
        : JSON.stringify(result, null, 2);
      return { content: [{ type: 'text' as const, text }] };
    },
  );

  server.tool(
    'get_selection',
    'Get the currently selected nodes in Figma with full compressed data.',
    {},
    async () => {
      const result = await bridge.request('get_selection', {});
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    'search_nodes',
    'Search for nodes by name on the current page. ' +
      'Optionally filter by node type (FRAME, TEXT, RECTANGLE, etc.).',
    {
      query: z.string().describe('Search query (matches node name, case-insensitive)'),
      types: z
        .array(z.string())
        .optional()
        .describe('Filter by node types (e.g. ["FRAME", "TEXT"])'),
      limit: z
        .number()
        .optional()
        .describe('Maximum results to return (default: 50)'),
    },
    async ({ query, types, limit }) => {
      const result = await bridge.request('search_nodes', { query, types, limit });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    'list_fonts',
    'List available font families in the Figma environment. ' +
      'Pass family to get all available styles for that family. ' +
      'Use before create_text to ensure the chosen font is available.',
    {
      family: z.string().optional().describe('Font family name to get available styles for'),
    },
    async ({ family }) => {
      const result = await bridge.request('list_fonts', { family });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    'get_reactions',
    'Get prototype reactions (interactions) on a specific node or all nodes on the current page. ' +
      'Returns trigger types (ON_CLICK, ON_HOVER, AFTER_TIMEOUT, etc.) and action types ' +
      '(NAVIGATE, OVERLAY, SCROLL_TO, etc.). Useful for analyzing prototype flows or generating interaction docs.',
    {
      nodeId: z.string().optional().describe('Node ID to inspect; omit to scan the entire current page'),
    },
    async ({ nodeId }) => {
      const result = await bridge.request('get_reactions', { nodeId });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
