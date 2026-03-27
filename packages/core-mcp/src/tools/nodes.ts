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
import { getCurrentPageLogic } from './logic/node-logic.js';

export function registerNodeTools(server: McpServer, bridge: Bridge): void {
  server.tool(
    'get_current_page',
    'Get the current page node tree (compressed). ' +
      'Returns page info and up to maxNodes top-level children with full style data. ' +
      'Use maxDepth to control tree traversal depth (default: 10). ' +
      'For large pages, use maxDepth=1 or 2 for a fast overview, then nodes(method: "get") for details.',
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
}
