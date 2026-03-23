/**
 * Library read tools — MCP wrappers for team library variable access.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';

export function registerLibraryTools(server: McpServer, bridge: Bridge): void {
  server.tool(
    'list_library_collections',
    'List all available team library variable collections. ' +
      'Returns collection key, name, and library name.',
    {},
    async () => {
      const result = await bridge.request('list_library_collections', {});
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    'list_library_variables',
    'List all variables in a specific team library collection.',
    {
      collectionKey: z.string().describe('The library collection key'),
    },
    async ({ collectionKey }) => {
      const result = await bridge.request('list_library_variables', { collectionKey });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    'import_library_variable',
    'Import a team library variable into the current file by key. ' +
      'Returns the imported variable details.',
    {
      variableKey: z.string().describe('The library variable key to import'),
    },
    async ({ variableKey }) => {
      const result = await bridge.request('import_library_variable', { variableKey });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
