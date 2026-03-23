/**
 * Selection tools — MCP wrappers for programmatic selection control.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';

export function registerSelectionTools(server: McpServer, bridge: Bridge): void {
  server.tool(
    'set_selection',
    'Set the current selection to specific nodes and optionally scroll them into view. ' +
      'Nodes must be on the current page.',
    {
      nodeIds: z.array(z.string()).describe('Node IDs to select'),
      scrollIntoView: z
        .boolean()
        .optional()
        .describe('Scroll viewport to show selected nodes (default: true)'),
    },
    async ({ nodeIds, scrollIntoView }) => {
      const result = await bridge.request('set_selection', { nodeIds, scrollIntoView });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
