/**
 * Style write tools — MCP wrappers for syncing/creating/deleting styles.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';

export function registerWriteStyleTools(server: McpServer, bridge: Bridge): void {
  server.tool(
    'sync_styles',
    'Sync composite design tokens (typography, shadow) to Figma Styles. ' +
      'For atomic tokens (color, number, etc.), use sync_tokens instead.',
    {
      tokens: z
        .array(
          z.object({
            path: z.string().describe('Token path (e.g. "heading/h1")'),
            type: z.string().describe('Token type: "typography" or "shadow"'),
            value: z.unknown().describe('Token value object'),
            description: z.string().optional().describe('Token description'),
          }),
        )
        .describe('Array of composite design tokens to sync'),
    },
    async ({ tokens }) => {
      const result = await bridge.request('sync_styles', { tokens });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'create_paint_style',
    'Create a new paint style with a solid color fill.',
    {
      name: z.string().describe('Style name'),
      color: z.string().describe('Hex color (e.g. "#FF0000")'),
      description: z.string().optional().describe('Style description'),
    },
    async (params) => {
      const result = await bridge.request('create_paint_style', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'delete_style',
    'Delete a style by ID.',
    {
      styleId: z.string().describe('Style ID to delete'),
    },
    async ({ styleId }) => {
      const result = await bridge.request('delete_style', { styleId });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'register_library_styles',
    'Register Text/Paint/Effect styles from a library for auto-application to new elements. ' +
      'Get style data from the official Figma MCP get_design_context on the library file, then pass here. ' +
      'Stored per-library in clientStorage, persists across sessions. ' +
      'create_text will auto-apply matching Text Style by fontSize.',
    {
      library: z.string().describe('Library name (must match the selected library name)'),
      styles: z.object({
        textStyles: z.array(z.object({
          key: z.string().describe('Style key (from Figma MCP)'),
          name: z.string().describe('Style name (e.g. "Heading XL")'),
          fontSize: z.number().describe('Font size in px'),
          fontFamily: z.string().describe('Font family name'),
          fontWeight: z.string().describe('Font weight (e.g. "Bold", "Regular")'),
        })).describe('Text styles'),
        paintStyles: z.array(z.object({
          key: z.string().describe('Style key'),
          name: z.string().describe('Style name (e.g. "Brand/Primary")'),
          hex: z.string().describe('Hex color (e.g. "#FF0000")'),
        })).describe('Paint styles'),
        effectStyles: z.array(z.object({
          key: z.string().describe('Style key'),
          name: z.string().describe('Style name (e.g. "Shadow/Default")'),
          effectType: z.string().describe('Effect type (DROP_SHADOW, INNER_SHADOW, LAYER_BLUR, BACKGROUND_BLUR)'),
        })).describe('Effect styles'),
      }),
    },
    async ({ library, styles }) => {
      const result = await bridge.request('register_library_styles', { library, styles });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'get_registered_styles',
    'Get previously registered styles for a library. Returns null if not registered.',
    {
      library: z.string().describe('Library name'),
    },
    async ({ library }) => {
      const result = await bridge.request('get_registered_styles', { library });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
