/**
 * Image & vector tools — MCP wrappers for image fills, SVG vectors, flatten, shapes.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';

export function registerImageVectorTools(server: McpServer, bridge: Bridge): void {
  server.tool(
    'set_image_fill',
    'Set a node\'s fill to an image. Provide base64-encoded image data (PNG/JPG). ' +
      'Use export_image to get image data from another node, or provide external image data.',
    {
      nodeId: z.string().describe('Target node ID'),
      imageData: z.string().describe('Base64-encoded image data (PNG or JPG)'),
      scaleMode: z.enum(['FILL', 'FIT', 'CROP', 'TILE']).optional()
        .describe('Image scale mode (default: FILL)'),
    },
    async (params) => {
      const result = await bridge.request('set_image_fill', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'create_vector',
    'Create a vector node from an SVG string. ' +
      'Accepts a complete SVG element (e.g. \'<svg>...</svg>\'). ' +
      'The SVG is parsed and converted to Figma vector paths.',
    {
      svg: z.string().describe('Complete SVG string (e.g. "<svg width=\\"24\\" height=\\"24\\">...</svg>")'),
      name: z.string().optional().describe('Node name (default: "Vector")'),
      x: z.number().optional().describe('X position'),
      y: z.number().optional().describe('Y position'),
      resize: z.tuple([z.number(), z.number()]).optional()
        .describe('Resize to [width, height] after creation'),
      parentId: z.string().optional().describe('Parent node ID'),
    },
    async (params) => {
      const result = await bridge.request('create_vector', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'flatten_node',
    'Flatten a node (or group) into a single vector. ' +
      'Useful for converting complex shapes into a single editable path.',
    {
      nodeId: z.string().describe('Node ID to flatten'),
    },
    async ({ nodeId }) => {
      const result = await bridge.request('flatten_node', { nodeId });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'create_star',
    'Create a star shape node.',
    {
      name: z.string().optional().describe('Node name'),
      x: z.number().optional().describe('X position'),
      y: z.number().optional().describe('Y position'),
      width: z.number().optional().describe('Width (default: 100)'),
      height: z.number().optional().describe('Height (default: 100)'),
      pointCount: z.number().optional().describe('Number of points (default: 5)'),
      innerRadius: z.number().optional().describe('Inner radius ratio 0-1 (default: 0.382)'),
      fill: z.string().optional().describe('Fill color as hex'),
      parentId: z.string().optional().describe('Parent node ID'),
    },
    async (params) => {
      const result = await bridge.request('create_star', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'create_polygon',
    'Create a regular polygon shape node.',
    {
      name: z.string().optional().describe('Node name'),
      x: z.number().optional().describe('X position'),
      y: z.number().optional().describe('Y position'),
      width: z.number().optional().describe('Width (default: 100)'),
      height: z.number().optional().describe('Height (default: 100)'),
      pointCount: z.number().optional().describe('Number of sides (default: 3 = triangle)'),
      fill: z.string().optional().describe('Fill color as hex'),
      parentId: z.string().optional().describe('Parent node ID'),
    },
    async (params) => {
      const result = await bridge.request('create_polygon', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
