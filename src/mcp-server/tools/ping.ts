/**
 * Ping tool — verifies MCP Server ↔ Relay ↔ Plugin connectivity.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Bridge } from '../bridge.js';

export function registerPing(server: McpServer, bridge: Bridge): void {
  server.tool(
    'ping',
    'Test connectivity to the Figma plugin through the WebSocket relay. ' +
      'Returns connection status and round-trip latency.',
    {
      channel: z
        .string()
        .optional()
        .describe('Channel ID (defaults to current channel)'),
    },
    async () => {
      if (!bridge.isConnected) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                connected: false,
                error: 'Not connected to relay. Start the relay (npm run dev:relay) and open the Figma plugin.',
              }),
            },
          ],
        };
      }

      const start = Date.now();
      try {
        const result = await bridge.request('ping', {});
        const latency = Date.now() - start;
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ connected: true, latency: `${latency}ms`, result }),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                connected: false,
                error: err instanceof Error ? err.message : String(err),
              }),
            },
          ],
        };
      }
    },
  );
}
