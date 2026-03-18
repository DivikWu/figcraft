/**
 * Export tool — export Figma node as image (PNG/SVG/PDF/JPG).
 * Supports REST API fallback when plugin is offline.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';
import { requestWithFallback, restExportImage } from '../rest-fallback.js';

export function registerExportTools(server: McpServer, bridge: Bridge): void {
  server.tool(
    'export_image',
    'Export a Figma node as an image. ' +
      'Returns base64-encoded image data.',
    {
      nodeId: z.string().describe('The node ID to export'),
      format: z
        .enum(['PNG', 'SVG', 'PDF', 'JPG'])
        .optional()
        .describe('Export format (default: PNG)'),
      scale: z
        .number()
        .optional()
        .describe('Export scale for raster formats (default: 2)'),
    },
    async ({ nodeId, format, scale }) => {
      const { result, source } = await requestWithFallback(
        bridge,
        'export_image',
        { nodeId, format, scale },
        () => restExportImage(nodeId, format, scale),
      );
      const text = source === 'rest-api'
        ? JSON.stringify(result, null, 2) + '\n\n⚠️ Exported via REST API (plugin offline).'
        : JSON.stringify(result, null, 2);
      return { content: [{ type: 'text' as const, text }] };
    },
  );
}
