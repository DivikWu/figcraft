/**
 * Component & Instance tools — MCP wrappers.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';
import { listLibraryComponentsLogic } from './logic/component-logic.js';

export function registerComponentTools(server: McpServer, bridge: Bridge): void {

  server.tool(
    'list_library_components',
    'List published components from a library file via REST API. ' +
      'Returns component key, name, description. Use the key with create_instance. ' +
      'Requires library file URL to be configured in the plugin panel, or provide fileKey directly.',
    {
      fileKey: z.string().optional().describe('Figma file key. If omitted, uses the key from the selected library\'s configured URL.'),
    },
    async ({ fileKey }) => {
      return listLibraryComponentsLogic(bridge, { fileKey });
    },
  );
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

  server.tool(
    'update_component',
    'Update a component\'s name, description, or size.',
    {
      nodeId: z.string().describe('Component node ID'),
      name: z.string().optional().describe('New component name'),
      description: z.string().optional().describe('New component description'),
      width: z.number().optional().describe('New width in px'),
      height: z.number().optional().describe('New height in px'),
    },
    async (params) => {
      const result = await bridge.request('update_component', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'delete_component',
    'Delete a component node.',
    {
      nodeId: z.string().describe('Component node ID to delete'),
    },
    async ({ nodeId }) => {
      const result = await bridge.request('delete_component', { nodeId });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'list_component_properties',
    'List all properties and variant options exposed by a component or component set. ' +
      'Use this to discover available variant values before calling create_instance with properties.',
    {
      nodeId: z.string().describe('Component or ComponentSet node ID'),
    },
    async ({ nodeId }) => {
      const result = await bridge.request('list_component_properties', { nodeId });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'create_component_set',
    'Combine multiple existing components into a variant set (ComponentSet).',
    {
      componentIds: z.array(z.string()).describe('Component node IDs to combine into a variant set'),
      name: z.string().optional().describe('Name for the variant set'),
    },
    async (params) => {
      const result = await bridge.request('create_component_set', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'get_instance_overrides',
    'Get the current override properties of a component instance (values that differ from component defaults).',
    {
      nodeId: z.string().describe('Instance node ID'),
    },
    async ({ nodeId }) => {
      const result = await bridge.request('get_instance_overrides', { nodeId });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'set_instance_overrides',
    'Copy override properties from a source instance to one or more target instances. ' +
      'Use get_instance_overrides first to inspect the source, then propagate to targets.',
    {
      sourceId: z.string().describe('Source instance node ID to copy overrides from'),
      targetIds: z.array(z.string()).describe('Target instance node IDs to apply overrides to'),
    },
    async (params) => {
      const result = await bridge.request('set_instance_overrides', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ─── Component Property Management ───

  server.tool(
    'audit_components',
    'Audit all components on the current page for structural health. ' +
      'Reports: missing descriptions, unexposed text nodes, empty components, ' +
      'single-variant sets, and property counts. Use for design system maintenance.',
    {
      nodeIds: z.array(z.string()).optional().describe('Specific node IDs to audit (default: entire page)'),
    },
    async (params) => {
      const result = await bridge.request('audit_components', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'add_component_property',
    'Add a new property to a component or component set. ' +
      'Supported types: BOOLEAN, TEXT, INSTANCE_SWAP, VARIANT.',
    {
      nodeId: z.string().describe('Component or ComponentSet node ID'),
      propertyName: z.string().describe('Property name'),
      type: z.enum(['BOOLEAN', 'TEXT', 'INSTANCE_SWAP', 'VARIANT']).describe('Property type'),
      defaultValue: z.union([z.string(), z.boolean()]).describe('Default value'),
    },
    async (params) => {
      const result = await bridge.request('add_component_property', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'update_component_property',
    'Update an existing component property (rename or change default value).',
    {
      nodeId: z.string().describe('Component or ComponentSet node ID'),
      propertyName: z.string().describe('Current property name'),
      newName: z.string().optional().describe('New property name'),
      defaultValue: z.union([z.string(), z.boolean()]).optional().describe('New default value'),
    },
    async (params) => {
      const result = await bridge.request('update_component_property', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'delete_component_property',
    'Remove a property from a component or component set.',
    {
      nodeId: z.string().describe('Component or ComponentSet node ID'),
      propertyName: z.string().describe('Property name to delete'),
    },
    async (params) => {
      const result = await bridge.request('delete_component_property', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
