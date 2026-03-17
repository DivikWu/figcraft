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

  server.tool(
    'rename_collection',
    'Rename a variable collection.',
    {
      collectionId: z.string().describe('Collection ID'),
      name: z.string().describe('New collection name'),
    },
    async (params) => {
      const result = await bridge.request('rename_collection', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'add_collection_mode',
    'Add a new mode to a variable collection. Returns the new mode ID.',
    {
      collectionId: z.string().describe('Collection ID'),
      name: z.string().describe('Mode name (e.g. "Dark", "Compact")'),
    },
    async (params) => {
      const result = await bridge.request('add_collection_mode', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'rename_collection_mode',
    'Rename an existing mode in a variable collection.',
    {
      collectionId: z.string().describe('Collection ID'),
      modeId: z.string().describe('Mode ID to rename'),
      name: z.string().describe('New mode name'),
    },
    async (params) => {
      const result = await bridge.request('rename_collection_mode', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'remove_collection_mode',
    'Remove a mode from a variable collection. Cannot remove the last remaining mode.',
    {
      collectionId: z.string().describe('Collection ID'),
      modeId: z.string().describe('Mode ID to remove'),
    },
    async (params) => {
      const result = await bridge.request('remove_collection_mode', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'create_variable_alias',
    'Set a variable\'s value to reference another variable (alias). ' +
      'Both variables must have the same resolved type. ' +
      'This is how Figma implements semantic tokens (e.g. "text/primary" → "gray/900").',
    {
      variableId: z.string().describe('Variable ID to set as alias'),
      targetVariableId: z.string().describe('Target variable ID to reference'),
      modeId: z.string().optional().describe('Mode ID (defaults to first mode)'),
    },
    async (params) => {
      const result = await bridge.request('create_variable_alias', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'export_variables',
    'Export all Figma variables as DTCG-compatible flat list. ' +
      'Resolves aliases to {path} references. Use this for reverse sync (Figma → DTCG file).',
    {
      collectionId: z.string().optional().describe('Filter by collection ID. Omit to export all.'),
    },
    async (params) => {
      const result = await bridge.request('export_variables', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'batch_create_variables',
    'Create multiple variables at once from an in-memory array. ' +
      'Faster than calling create_variable repeatedly. ' +
      'Automatically creates the collection if it doesn\'t exist.',
    {
      collectionName: z.string().describe('Collection name (created if not exists)'),
      modeName: z.string().optional().describe('Mode name (default: "Default")'),
      variables: z.array(z.object({
        name: z.string().describe('Variable name (slash-separated path, e.g. "color/brand/primary")'),
        type: z.enum(['COLOR', 'FLOAT', 'STRING', 'BOOLEAN']).describe('Variable type'),
        value: z.unknown().describe('Variable value'),
        description: z.string().optional(),
        scopes: z.array(z.string()).optional(),
      })).describe('Array of variables to create'),
    },
    async (params) => {
      const result = await bridge.request('batch_create_variables', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
