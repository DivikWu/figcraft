/**
 * Variables read tools — MCP wrappers for listing variables and collections.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';

export function registerVariableTools(server: McpServer, bridge: Bridge): void {
  server.tool(
    'list_variables',
    'List all local Figma variables, optionally filtered by collection or type. ' +
      'Returns variable name, type, scopes, and values per mode.',
    {
      collectionId: z
        .string()
        .optional()
        .describe('Filter by variable collection ID'),
      type: z
        .string()
        .optional()
        .describe('Filter by resolved type: COLOR, FLOAT, STRING, BOOLEAN'),
    },
    async ({ collectionId, type }) => {
      const result = await bridge.request('list_variables', { collectionId, type });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    'get_variable',
    'Get detailed info for a specific variable by ID, ' +
      'including values per mode, scopes, and code syntax.',
    {
      variableId: z.string().describe('The Figma variable ID'),
    },
    async ({ variableId }) => {
      const result = await bridge.request('get_variable', { variableId });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    'list_collections',
    'List all local variable collections with their modes and variable counts.',
    {},
    async () => {
      const result = await bridge.request('list_collections', {});
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
