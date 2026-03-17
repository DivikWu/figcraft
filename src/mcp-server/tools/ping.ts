/**
 * Ping tool — verifies MCP Server ↔ Relay ↔ Plugin connectivity.
 * Includes version mismatch detection.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Bridge } from '../bridge.js';

const SERVER_VERSION = '0.1.0';

export function registerPing(server: McpServer, bridge: Bridge): void {
  server.tool(
    'ping',
    'Test connectivity to the Figma plugin through the WebSocket relay. ' +
      'Returns connection status, round-trip latency, and version check.',
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
        const result = await bridge.request('ping', {}) as Record<string, unknown>;
        const latency = Date.now() - start;

        const pluginVersion = result.pluginVersion as string | undefined;
        let versionWarning: string | undefined;
        if (pluginVersion && pluginVersion !== SERVER_VERSION) {
          versionWarning = `Version mismatch: MCP Server ${SERVER_VERSION}, Plugin ${pluginVersion}. Please rebuild the plugin.`;
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                connected: true,
                latency: `${latency}ms`,
                serverVersion: SERVER_VERSION,
                pluginVersion: pluginVersion ?? 'unknown',
                ...(versionWarning ? { versionWarning } : {}),
                result,
              }),
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
