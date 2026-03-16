/**
 * Variable write tools — MCP wrappers for creating/updating/deleting variables and collections.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';

export function registerWriteVariableTools(server: McpServer, bridge: Bridge): void {
  server.tool(
    'create_variable',
    'Create a new Figma variable in a collection.',
    {
      name: z.string().describe('Variable name'),
      collectionId: z.string().describe('Target variable collection ID'),
      resolvedType: z
        .enum(['COLOR', 'FLOAT', 'STRING', 'BOOLEAN'])
        .describe('Variable type'),
      value: z.unknown().optional().describe('Initial value for the default mode'),
      modeId: z.string().optional().describe('Mode ID to set the value for (defaults to first mode)'),
      description: z.string().optional().describe('Variable description'),
      scopes: z
        .array(z.string())
        .optional()
        .describe('Variable scopes (e.g. ALL_FILLS, CORNER_RADIUS)'),
    },
    async (params) => {
      const result = await bridge.request('create_variable', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'update_variable',
    'Update properties of an existing variable (name, description, scopes, value).',
    {
      variableId: z.string().describe('Variable ID to update'),
      name: z.string().optional().describe('New variable name'),
      description: z.string().optional().describe('New description'),
      scopes: z
        .array(z.string())
        .optional()
        .describe('New scopes array'),
      value: z.unknown().optional().describe('New value (requires modeId)'),
      modeId: z.string().optional().describe('Mode ID for the value update'),
    },
    async (params) => {
      const result = await bridge.request('update_variable', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'delete_variable',
    'Delete a variable by ID.',
    {
      variableId: z.string().describe('Variable ID to delete'),
    },
    async ({ variableId }) => {
      const result = await bridge.request('delete_variable', { variableId });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'create_collection',
    'Create a new variable collection. Returns the collection ID and default mode.',
    {
      name: z.string().describe('Collection name'),
    },
    async ({ name }) => {
      const result = await bridge.request('create_collection', { name });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'delete_collection',
    'Delete a variable collection by ID.',
    {
      collectionId: z.string().describe('Collection ID to delete'),
    },
    async ({ collectionId }) => {
      const result = await bridge.request('delete_collection', { collectionId });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
