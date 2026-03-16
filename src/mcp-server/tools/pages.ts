/**
 * Page management tools — MCP wrappers for switching, creating, renaming pages.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';

export function registerPageTools(server: McpServer, bridge: Bridge): void {
  server.tool(
    'set_current_page',
    'Switch to a different page by name or ID. ' +
      'Warning: this changes the context for all subsequent operations.',
    {
      nameOrId: z.string().describe('Page name or page ID'),
    },
    async ({ nameOrId }) => {
      const result = await bridge.request('set_current_page', { nameOrId });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'create_page',
    'Create a new page in the document.',
    {
      name: z.string().describe('Page name'),
    },
    async ({ name }) => {
      const result = await bridge.request('create_page', { name });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'rename_page',
    'Rename an existing page.',
    {
      pageId: z.string().describe('Page ID'),
      name: z.string().describe('New page name'),
    },
    async ({ pageId, name }) => {
      const result = await bridge.request('rename_page', { pageId, name });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
