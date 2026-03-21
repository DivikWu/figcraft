/**
 * Annotation tools — MCP wrappers for reading and writing Figma annotations.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';

export function registerAnnotationTools(server: McpServer, bridge: Bridge): void {
  server.tool(
    'get_annotations',
    'Get all annotations on the current page or a specific node. ' +
      'Returns each annotated node with its annotation labels.',
    {
      nodeId: z.string().optional().describe('Node ID to inspect; omit to scan the entire current page'),
    },
    async ({ nodeId }) => {
      const result = await bridge.request('get_annotations', { nodeId });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'set_annotation',
    'Add or replace an annotation on a node. ' +
      'Use replace=true to overwrite existing annotations; omit or set false to append.',
    {
      nodeId: z.string().describe('Target node ID'),
      label: z.string().describe('Annotation text (Markdown supported)'),
      replace: z.boolean().optional().describe('If true, replaces all existing annotations on the node (default: false = append)'),
    },
    async (params) => {
      const result = await bridge.request('set_annotation', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'set_multiple_annotations',
    'Batch annotate multiple nodes in a single call. Each item can independently append or replace.',
    {
      items: z.array(
        z.object({
          nodeId: z.string().describe('Target node ID'),
          label: z.string().describe('Annotation text'),
          replace: z.boolean().optional().describe('If true, replaces existing annotations on this node'),
        }),
      ).describe('List of annotation operations'),
    },
    async ({ items }) => {
      const result = await bridge.request('set_multiple_annotations', { items });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // get_reactions is registered via _generated.ts (handler: bridge in YAML).
  // It was moved from nodes.ts to the annotations toolset in schema/tools.yaml.
}
