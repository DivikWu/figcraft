/**
 * Channel tool — switch MCP Server to a different plugin channel.
 * Enables multi-document support: each Figma document uses a unique channel.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Bridge } from '../bridge.js';

export function registerChannelTools(server: McpServer, bridge: Bridge): void {
  server.tool(
    'join_channel',
    'Switch to a different Figma plugin channel. Each Figma document runs its own plugin instance with a unique channel ID. ' +
      'Use this to target a specific document.',
    {
      channel: z.string().describe('The channel ID shown in the Figma plugin UI'),
    },
    async ({ channel }) => {
      try {
        bridge.joinChannel(channel);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                ok: true,
                channel,
                message: `Joined channel "${channel}". Commands will now target this document.`,
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
                ok: false,
                error: err instanceof Error ? err.message : String(err),
              }),
            },
          ],
        };
      }
    },
  );

  server.tool('get_channel', 'Get the current channel ID that the MCP Server is connected to.', {}, async () => {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            channel: bridge.currentChannel,
            connected: bridge.isConnected,
          }),
        },
      ],
    };
  });
}
