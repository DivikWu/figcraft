/**
 * Mode tools — get/set operation mode (library vs spec).
 *
 * Mode source of truth lives in the Figma Plugin's clientStorage.
 * MCP Server round-trips to the plugin via bridge for every get/set.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';

export function registerModeTools(server: McpServer, bridge: Bridge): void {
  server.tool(
    'get_mode',
    'Get current mode, selected library, and design context. ' +
      'IMPORTANT: Call this before creating elements to get available design tokens. ' +
      'Returns { mode, selectedLibrary, designContext }. ' +
      'designContext contains grouped tokens (text/surface/fill/border) and defaults mapping. ' +
      'Use import_library_variable + set_variable_binding to apply non-default tokens.',
    {},
    async () => {
      const result = await bridge.request('get_mode', {}) as { mode: string };
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    },
  );

  server.tool(
    'set_mode',
    'Switch operation mode between "library" (Figma shared library) ' +
      'and "spec" (DTCG design spec documents). Also updates the Plugin UI toggle. ' +
      'In library mode, optionally specify which library to use.',
    {
      mode: z.enum(['library', 'spec']).describe('Operation mode to switch to'),
      library: z.string().optional().describe('Library name to use in library mode (from list_library_collections libraryName). Use "__local__" to select current file local styles/variables.'),
    },
    async ({ mode, library }) => {
      const params: Record<string, unknown> = { mode };
      if (library !== undefined) params.library = library;
      const result = await bridge.request('set_mode', params) as { mode: string; selectedLibrary: string | null };
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            mode: result.mode,
            description: result.mode === 'library'
              ? 'Using Figma shared library as token source. Lint checks variable/style bindings.'
              : 'Using DTCG spec documents as token source. Lint checks against DTCG token values.',
          }, null, 2),
        }],
      };
    },
  );
}
