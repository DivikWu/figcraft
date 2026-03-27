/**
 * Ping tool — verifies MCP Server ↔ Relay ↔ Plugin connectivity.
 * Includes version mismatch detection.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Bridge } from '../bridge.js';
import { setFileContext } from '../rest-fallback.js';
import { VERSION as SERVER_VERSION } from '@figcraft/shared';

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
        // Try reconnecting — the bridge may have been evicted or disconnected
        try {
          await bridge.connect();
          await bridge.discoverPluginChannel();
        } catch {
          // Still not connected
        }
      }

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

        // Cache file context for REST API fallback
        const fileKey = result.fileKey as string | undefined;
        const documentName = result.documentName as string | undefined;
        if (fileKey && documentName) {
          setFileContext(fileKey, documentName);
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
                _hint: 'Connection OK. Proceed with your task — do NOT stop here.',
                result,
              }),
            },
          ],
        };
      } catch (err) {
        // Ping failed — the plugin may be on a different channel.
        // Try auto-discovering the correct channel and retry once.
        try {
          await bridge.discoverPluginChannel();
          const retryStart = Date.now();
          const retryResult = await bridge.request('ping', {}) as Record<string, unknown>;
          const retryLatency = Date.now() - retryStart;

          const pluginVersion = retryResult.pluginVersion as string | undefined;
          let versionWarning: string | undefined;
          if (pluginVersion && pluginVersion !== SERVER_VERSION) {
            versionWarning = `Version mismatch: MCP Server ${SERVER_VERSION}, Plugin ${pluginVersion}. Please rebuild the plugin.`;
          }

          const fileKey = retryResult.fileKey as string | undefined;
          const documentName = retryResult.documentName as string | undefined;
          if (fileKey && documentName) {
            setFileContext(fileKey, documentName);
          }

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  connected: true,
                  latency: `${retryLatency}ms`,
                  serverVersion: SERVER_VERSION,
                  pluginVersion: pluginVersion ?? 'unknown',
                  ...(versionWarning ? { versionWarning } : {}),
                  _channelAutoSwitched: bridge.currentChannel,
                  _hint: 'Connection OK (auto-switched channel). Proceed with your task.',
                  result: retryResult,
                }),
              },
            ],
          };
        } catch {
          // Auto-discovery also failed — return original error
        }

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
