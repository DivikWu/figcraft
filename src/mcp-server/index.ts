/**
 * figcraft MCP Server entry point.
 *
 * Registers tools and connects via stdio transport.
 * Bridges to Figma Plugin through WebSocket relay.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Bridge } from './bridge.js';
import { registerPing } from './tools/ping.js';

const RELAY_URL = process.env.FIGCRAFT_RELAY_URL ?? 'ws://localhost:3055';
const CHANNEL = process.env.FIGCRAFT_CHANNEL ?? 'default';

const server = new McpServer({
  name: 'figcraft',
  version: '0.1.0',
});

const bridge = new Bridge(RELAY_URL, CHANNEL);

// ─── Register tools ───

registerPing(server, bridge);

// P1: read tools will be registered here
// P2: write tools will be registered here
// P3: lint tools will be registered here
// P4: generation tools will be registered here

// ─── Start ───

async function main(): Promise<void> {
  // Connect to relay (non-blocking — tools will fail gracefully if not connected)
  bridge.connect().catch((err) => {
    console.error('[figcraft mcp] Failed to connect to relay:', err.message);
    console.error('[figcraft mcp] Start the relay first: npm run dev:relay');
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[figcraft mcp] MCP server running (stdio)');
}

main().catch((err) => {
  console.error('[figcraft mcp] Fatal:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  bridge.disconnect();
  process.exit(0);
});
