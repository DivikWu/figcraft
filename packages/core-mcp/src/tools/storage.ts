/**
 * Token cache storage tools — save/load/list/delete cached tokens.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Bridge } from '../bridge.js';
import { parseDtcgFile } from '../dtcg.js';

export function registerStorageTools(server: McpServer, bridge: Bridge): void {
  server.tool(
    'cache_tokens',
    'Parse a DTCG file and cache the tokens in Figma clientStorage. ' +
      'Cached tokens can be used by lint and generate tools without re-reading the file.',
    {
      filePath: z.string().describe('Path to DTCG JSON file'),
      name: z.string().optional().describe('Cache entry name (default: file basename)'),
    },
    async ({ filePath, name }) => {
      const tokens = await parseDtcgFile(filePath);
      const cacheName = name ?? filePath.split('/').pop()?.replace('.json', '') ?? 'tokens';
      await bridge.request('save_spec_tokens', { name: cacheName, tokens });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ cached: tokens.length, name: cacheName }, null, 2),
          },
        ],
      };
    },
  );
}
