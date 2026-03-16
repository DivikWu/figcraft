/**
 * Component & Instance tools — MCP wrappers.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';

export function registerComponentTools(server: McpServer, bridge: Bridge): void {
  server.tool(
    'list_components',
    'List all components on the current page.',
    {},
    async () => {
      const result = await bridge.request('list_components', {});
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'get_component',
    'Get full details of a component by node ID.',
    {
      nodeId: z.string().describe('Component node ID'),
    },
    async ({ nodeId }) => {
      const result = await bridge.request('get_component', { nodeId });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'create_component',
    'Create a new component with specified dimensions.',
    {
      name: z.string().optional().describe('Component name (default: "Component")'),
      width: z.number().optional().describe('Width in px (default: 100)'),
      height: z.number().optional().describe('Height in px (default: 100)'),
      description: z.string().optional().describe('Component description'),
    },
    async (params) => {
      const result = await bridge.request('create_component', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'create_instance',
    'Create an instance of a component. ' +
      'Can use either a local component ID or a library component key.',
    {
      componentId: z.string().optional().describe('Local component node ID'),
      componentKey: z.string().optional().describe('Library component key (for imports)'),
      properties: z.record(z.string()).optional().describe('Variant/property overrides'),
      parentId: z.string().optional().describe('Parent node ID to append to'),
    },
    async (params) => {
      const result = await bridge.request('create_instance', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'swap_instance',
    'Swap an existing instance to a different component.',
    {
      instanceId: z.string().describe('Instance node ID'),
      componentKey: z.string().describe('New component key to swap to'),
    },
    async ({ instanceId, componentKey }) => {
      const result = await bridge.request('swap_instance', { instanceId, componentKey });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'detach_instance',
    'Detach an instance from its component, converting it to a frame.',
    {
      instanceId: z.string().describe('Instance node ID'),
    },
    async ({ instanceId }) => {
      const result = await bridge.request('detach_instance', { instanceId });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'reset_instance_overrides',
    'Reset all overrides on an instance back to the component defaults.',
    {
      instanceId: z.string().describe('Instance node ID'),
    },
    async ({ instanceId }) => {
      const result = await bridge.request('reset_instance_overrides', { instanceId });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
