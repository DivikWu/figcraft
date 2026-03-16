/**
 * Scan tools — MCP wrappers for style scanning, token export, and diff.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';

export function registerScanTools(server: McpServer, bridge: Bridge): void {
  server.tool(
    'scan_styles',
    'Scan all local styles (paint, text, effect) and return a summary with counts and details.',
    {},
    async () => {
      const result = await bridge.request('scan_styles', {});
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'export_tokens',
    'Export all local Figma variables as DTCG-format tokens, grouped by collection.',
    {},
    async () => {
      const result = await bridge.request('export_tokens', {});
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'diff_styles',
    'Compare DTCG tokens against current Figma variables. ' +
      'Shows in-sync, value-mismatch, and missing tokens in both directions.',
    {
      tokens: z
        .array(
          z.object({
            path: z.string().describe('Token path'),
            type: z.string().describe('Token type'),
            value: z.unknown().describe('Token value'),
          }),
        )
        .describe('DTCG tokens to compare against Figma variables'),
    },
    async ({ tokens }) => {
      const result = await bridge.request('diff_styles', { tokens });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
