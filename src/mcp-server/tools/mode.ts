/**
 * Mode tools — get/set operation mode (library vs spec).
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';
import type { OperationMode } from '../../shared/types.js';

let currentMode: OperationMode = 'library';

export function registerModeTools(server: McpServer, _bridge: Bridge): void {
  server.tool(
    'get_mode',
    'Get the current operation mode. ' +
      '"library" uses Figma shared library as token source; ' +
      '"spec" uses DTCG design spec documents.',
    {},
    async () => {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ mode: currentMode }, null, 2),
        }],
      };
    },
  );

  server.tool(
    'set_mode',
    'Switch operation mode between "library" (Figma shared library) ' +
      'and "spec" (DTCG design spec documents).',
    {
      mode: z.enum(['library', 'spec']).describe('Operation mode to switch to'),
    },
    async ({ mode }) => {
      currentMode = mode;
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            mode: currentMode,
            description: mode === 'library'
              ? 'Using Figma shared library as token source. Lint checks variable/style bindings.'
              : 'Using DTCG spec documents as token source. Lint checks against DTCG token values.',
          }, null, 2),
        }],
      };
    },
  );
}
