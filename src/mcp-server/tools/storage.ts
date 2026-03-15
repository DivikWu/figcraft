/**
 * Token cache storage tools — save/load/list/delete cached tokens.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
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
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ cached: tokens.length, name: cacheName }, null, 2),
        }],
      };
    },
  );

  server.tool(
    'list_cached_tokens',
    'List all cached token entries in Figma clientStorage.',
    {},
    async () => {
      const result = await bridge.request('list_spec_tokens', {});
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'delete_cached_tokens',
    'Delete a cached token entry from Figma clientStorage.',
    {
      name: z.string().describe('Cache entry name to delete'),
    },
    async ({ name }) => {
      const result = await bridge.request('delete_spec_tokens', { name });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
