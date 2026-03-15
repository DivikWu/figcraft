/**
 * Styles read tools — MCP wrappers for listing paint, text, effect, grid styles.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';

export function registerStyleTools(server: McpServer, bridge: Bridge): void {
  server.tool(
    'list_styles',
    'List all local Figma styles (paint, text, effect, grid). ' +
      'Optionally filter by type.',
    {
      type: z
        .string()
        .optional()
        .describe('Filter by style type: PAINT, TEXT, EFFECT, GRID'),
    },
    async ({ type }) => {
      const result = await bridge.request('list_styles', { type });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    'get_style',
    'Get detailed info for a specific style by ID.',
    {
      styleId: z.string().describe('The Figma style ID'),
    },
    async ({ styleId }) => {
      const result = await bridge.request('get_style', { styleId });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
