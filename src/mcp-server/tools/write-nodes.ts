/**
 * Node write tools — MCP wrappers for creating/updating/deleting nodes.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';

export function registerWriteNodeTools(server: McpServer, bridge: Bridge): void {
  server.tool(
    'create_frame',
    'Create a new frame (optionally with auto layout). ' +
      'Returns the created node data.',
    {
      name: z.string().optional().describe('Frame name'),
      width: z.number().optional().describe('Width in px (default: 100)'),
      height: z.number().optional().describe('Height in px (default: 100)'),
      parentId: z.string().optional().describe('Parent node ID to append to'),
      autoLayout: z.boolean().optional().describe('Enable auto layout'),
      layoutDirection: z.enum(['HORIZONTAL', 'VERTICAL']).optional().describe('Auto layout direction'),
      itemSpacing: z.number().optional().describe('Spacing between items'),
      padding: z.number().optional().describe('Uniform padding'),
      fill: z.string().optional().describe('Fill color as hex (e.g. "#FF0000")'),
    },
    async (params) => {
      const result = await bridge.request('create_frame', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'create_text',
    'Create a text node with specified content and font.',
    {
      content: z.string().describe('Text content'),
      name: z.string().optional().describe('Node name'),
      fontSize: z.number().optional().describe('Font size (default: 16)'),
      fontFamily: z.string().optional().describe('Font family (default: Inter)'),
      fontStyle: z.string().optional().describe('Font style (default: Regular)'),
      fill: z.string().optional().describe('Text color as hex'),
      parentId: z.string().optional().describe('Parent node ID'),
    },
    async (params) => {
      const result = await bridge.request('create_text', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'patch_nodes',
    'Update properties on one or more existing nodes. ' +
      'Supports: x, y, name, visible, opacity, cornerRadius, resize, fills, itemSpacing.',
    {
      patches: z.array(z.object({
        nodeId: z.string().describe('Node ID'),
        props: z.record(z.unknown()).describe('Properties to update'),
      })).describe('Array of node patches'),
    },
    async ({ patches }) => {
      const result = await bridge.request('patch_nodes', { patches });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'delete_node',
    'Delete a node by ID.',
    {
      nodeId: z.string().describe('Node ID to delete'),
    },
    async ({ nodeId }) => {
      const result = await bridge.request('delete_node', { nodeId });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'clone_node',
    'Clone a node and return the new copy.',
    {
      nodeId: z.string().describe('Node ID to clone'),
    },
    async ({ nodeId }) => {
      const result = await bridge.request('clone_node', { nodeId });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
