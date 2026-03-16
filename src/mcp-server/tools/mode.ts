/**
 * Mode tools — get/set operation mode (library vs spec).
 *
 * Mode source of truth lives in the Figma Plugin's clientStorage.
 * MCP Server round-trips to the plugin via bridge for every get/set.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';
import { fetchLibraryComponents } from '../figma-api.js';
import { getToken } from '../auth.js';

export function registerModeTools(server: McpServer, bridge: Bridge): void {
  server.tool(
    'get_mode',
    'Get current mode, selected library, design context, and library components. ' +
      'IMPORTANT: Call this before creating elements to get available design tokens and components. ' +
      'Returns { mode, selectedLibrary, designContext, libraryComponents? }. ' +
      'designContext contains grouped tokens (text/surface/fill/border) and defaults mapping. ' +
      'libraryComponents (when library file URL is configured) lists available components with keys for create_instance.',
    {},
    async () => {
      const result = await bridge.request('get_mode', {}) as {
        mode: string;
        selectedLibrary?: string;
        designContext?: unknown;
      };

      // Enrich with library components if fileKey is configured
      if (result.selectedLibrary) {
        const fileKey = bridge.getLibraryFileKey(result.selectedLibrary);
        if (fileKey) {
          try {
            const token = await getToken();
            const components = await fetchLibraryComponents(fileKey, token);
            (result as Record<string, unknown>).libraryComponents = components.map((c) => ({
              key: c.key,
              name: c.name,
              description: c.description,
            }));
          } catch (err) {
            console.warn('[FigCraft] Failed to fetch library components:', err);
          }
        }
      }

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
