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

  server.tool(
    'get_node_variables',
    'Get all variable bindings on a node — shows which variables are bound to which properties.',
    {
      nodeId: z.string().describe('Node ID to inspect for variable bindings'),
    },
    async ({ nodeId }) => {
      const result = await bridge.request('get_node_variables', { nodeId });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    'set_variable_binding',
    'Bind a variable to a specific property on a node (e.g. fills, cornerRadius, itemSpacing).',
    {
      nodeId: z.string().describe('Target node ID'),
      field: z.string().describe('Property field to bind (e.g. "fills", "cornerRadius", "itemSpacing")'),
      variableId: z.string().describe('Variable ID to bind'),
    },
    async ({ nodeId, field, variableId }) => {
      const result = await bridge.request('set_variable_binding', { nodeId, field, variableId });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    'set_explicit_variable_mode',
    'Set an explicit variable mode on a node for a specific collection. ' +
      'This overrides the inherited mode.',
    {
      nodeId: z.string().describe('Node ID'),
      collectionId: z.string().describe('Variable collection ID'),
      modeId: z.string().describe('Mode ID to set (get available modes from list_collections)'),
    },
    async ({ nodeId, collectionId, modeId }) => {
      const result = await bridge.request('set_explicit_variable_mode', { nodeId, collectionId, modeId });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
