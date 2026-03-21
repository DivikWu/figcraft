/**
 * Node read tools — MCP wrappers that bridge to Plugin handlers.
 * Supports REST API fallback for get_node_info and get_document_info
 * when the plugin is offline but an API token is available.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Bridge } from '../bridge.js';
import {
  requestWithFallback,
  restGetDocumentInfo,
} from '../rest-fallback.js';
import { getNodeInfoLogic, getCurrentPageLogic, searchNodesLogic } from './logic/node-logic.js';

export function registerNodeTools(server: McpServer, bridge: Bridge): void {
  server.tool(
    'get_node_info',
    'Get detailed information about a specific Figma node by ID, ' +
      'including layout, styles, variable bindings, and children.',
    {
      nodeId: z.string().describe('The Figma node ID (e.g. "1:23")'),
    },
    async ({ nodeId }) => {
      return getNodeInfoLogic(bridge, { nodeId });
    },
  );

  server.tool(
    'get_current_page',
    'Get the current page node tree (compressed). ' +
      'Returns page info and up to maxNodes top-level children with full style data. ' +
      'Use maxDepth to control tree traversal depth (default: 10). ' +
      'For large pages, use maxDepth=1 or 2 for a fast overview, then get_node_info for details.',
    {
      maxNodes: z
        .number()
        .optional()
        .describe('Maximum number of top-level nodes to return (default: 200)'),
      maxDepth: z
        .number()
        .optional()
        .describe('Maximum tree depth to traverse (default: 10). Use 1-2 for fast overview of large pages.'),
    },
    async ({ maxNodes, maxDepth }) => {
      return getCurrentPageLogic(bridge, { maxNodes, maxDepth });
    },
  );

  server.tool(
    'get_document_info',
    'Get document overview: name, current page, and list of all pages. ' +
      'NOTE: For most tasks, prefer get_current_page (with maxDepth=1 for overview) instead — it returns actual node data. ' +
      'Use get_document_info only when you need to list all pages or switch pages.',
    {},
    async () => {
      const { result, source } = await requestWithFallback(
        bridge,
        'get_document_info',
        {},
        () => restGetDocumentInfo(),
      );
      const text = source === 'rest-api'
        ? JSON.stringify(result, null, 2) + '\n\n⚠️ Data from REST API (plugin offline). Variable bindings and some properties may be missing.'
        : JSON.stringify(result, null, 2) + '\n\n_hint: Document info loaded. Continue with your task — do NOT stop here.';
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
      return searchNodesLogic(bridge, { query, types, limit });
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

}
