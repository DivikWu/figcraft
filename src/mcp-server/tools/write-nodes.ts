/**
 * Node write tools — MCP wrappers for creating/updating/deleting nodes.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';

export function registerWriteNodeTools(server: McpServer, bridge: Bridge): void {
  server.tool(
    'create_frame',
    'Create a new frame (optionally with auto layout). Returns the created node data. ' +
      'When a design library is selected and fill is not specified, auto-binds the default surface color token.',
    {
      name: z.string().optional().describe('Frame name'),
      x: z.number().optional().describe('X position'),
      y: z.number().optional().describe('Y position'),
      width: z.number().optional().describe('Width in px (default: 100)'),
      height: z.number().optional().describe('Height in px (default: 100)'),
      parentId: z.string().optional().describe('Parent node ID to append to'),
      autoLayout: z.boolean().optional().describe('Enable auto layout'),
      layoutDirection: z.enum(['HORIZONTAL', 'VERTICAL']).optional().describe('Auto layout direction'),
      itemSpacing: z.number().optional().describe('Spacing between items'),
      padding: z.number().optional().describe('Uniform padding'),
      primaryAxisAlignItems: z.enum(['MIN', 'CENTER', 'MAX', 'SPACE_BETWEEN']).optional().describe('Main axis alignment (default: MIN)'),
      counterAxisAlignItems: z.enum(['MIN', 'CENTER', 'MAX']).optional().describe('Cross axis alignment (default: MIN). Use CENTER to vertically center children in HORIZONTAL layout.'),
      fill: z.string().optional().describe('Fill color as hex (e.g. "#FF0000")'),
    },
    async (params) => {
      const result = await bridge.request('create_frame', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'create_text',
    'Create a text node with specified content and font. ' +
      'When a design library is selected: auto-applies matching Text Style if discovered in current page, ' +
      'falls back to typography variable binding (fontSize/fontFamily/fontWeight/lineHeight), ' +
      'and auto-binds text/primary color if fill not specified.',
    {
      content: z.string().describe('Text content'),
      name: z.string().optional().describe('Node name'),
      x: z.number().optional().describe('X position'),
      y: z.number().optional().describe('Y position'),
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

  server.tool(
    'set_text_content',
    'Update the text content of an existing text node.',
    {
      nodeId: z.string().describe('Text node ID'),
      content: z.string().describe('New text content'),
    },
    async ({ nodeId, content }) => {
      const result = await bridge.request('set_text_content', { nodeId, content });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // Fixed-depth schema (3 levels) to avoid z.lazy() recursive reference issues
  // with zod-to-json-schema. Plugin handler supports arbitrary depth natively.
  const propsDesc =
    'frame: width, height, x, y, fill, cornerRadius, autoLayout, layoutDirection, itemSpacing, padding. ' +
    'text: content, fontSize, fontFamily, fontStyle, fill.';

  const leafNode = z.object({
    type: z.enum(['frame', 'text']),
    name: z.string().optional(),
    props: z.record(z.unknown()).optional().describe(propsDesc),
  });

  const level2Node = leafNode.extend({
    children: z.array(leafNode).optional(),
  });

  const level1Node = leafNode.extend({
    children: z.array(level2Node).optional(),
  });

  server.tool(
    'create_document',
    'Batch-create a tree of frames and text nodes in one call. ' +
      'Use this instead of multiple create_frame/create_text calls to minimize round-trips. ' +
      'Supports 3 levels of nesting (root → card → leaf).',
    {
      parentId: z.string().optional().describe('Parent node ID. Omit to add to current page.'),
      nodes: z.array(level1Node).describe('Array of node specs (supports 3 levels of nesting)'),
    },
    async ({ parentId, nodes }) => {
      const result = await bridge.request('create_document', { parentId, nodes }, 120_000);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'insert_child',
    'Move a node into a parent container, optionally at a specific index.',
    {
      parentId: z.string().describe('Parent node ID (must be a container like Frame)'),
      childId: z.string().describe('Child node ID to insert'),
      index: z.number().optional().describe('Insert position (0-based). Omit to append at end.'),
    },
    async ({ parentId, childId, index }) => {
      const result = await bridge.request('insert_child', { parentId, childId, index });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
