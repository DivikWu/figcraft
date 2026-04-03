/**
 * Style write tools — MCP wrappers for syncing/creating/deleting styles.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Bridge } from '../bridge.js';
import { jsonResponse } from './response-helpers.js';

export function registerWriteStyleTools(server: McpServer, bridge: Bridge): void {
  server.tool(
    'register_library_styles',
    'Register Text/Paint/Effect styles from a library for auto-application to new elements. ' +
      'Get style data from the official Figma MCP get_design_context on the library file, then pass here. ' +
      'Stored per-library in clientStorage, persists across sessions. ' +
      'text(method: "create") will auto-apply matching Text Style by fontSize.',
    {
      library: z.string().describe('Library name (must match the selected library name)'),
      styles: z.object({
        textStyles: z
          .array(
            z.object({
              key: z.string().describe('Style key (from Figma MCP)'),
              name: z.string().describe('Style name (e.g. "Heading XL")'),
              fontSize: z.number().describe('Font size in px'),
              fontFamily: z.string().describe('Font family name'),
              fontWeight: z.string().describe('Font weight (e.g. "Bold", "Regular")'),
            }),
          )
          .describe('Text styles'),
        paintStyles: z
          .array(
            z.object({
              key: z.string().describe('Style key'),
              name: z.string().describe('Style name (e.g. "Brand/Primary")'),
              hex: z.string().describe('Hex color (e.g. "#FF0000")'),
            }),
          )
          .describe('Paint styles'),
        effectStyles: z
          .array(
            z.object({
              key: z.string().describe('Style key'),
              name: z.string().describe('Style name (e.g. "Shadow/Default")'),
              effectType: z.string().describe('Effect type (DROP_SHADOW, INNER_SHADOW, LAYER_BLUR, BACKGROUND_BLUR)'),
            }),
          )
          .describe('Effect styles'),
      }),
    },
    async ({ library, styles }) => {
      const result = await bridge.request('register_library_styles', { library, styles });
      return jsonResponse(result);
    },
  );
}
