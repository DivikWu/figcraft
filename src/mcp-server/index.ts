/**
 * figcraft MCP Server entry point.
 *
 * Registers tools and connects via stdio transport.
 * Bridges to Figma Plugin through WebSocket relay.
 *
 * Uses dynamic toolset manager: only ~30 core tools are enabled by default.
 * Agent can load additional toolsets on demand via load_toolset.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Bridge } from './bridge.js';
import { registerPrompts } from './prompts/index.js';
import { setBridgeTokenProvider } from './auth.js';
import { startRelay } from '../relay/index.js';
import {
  registerAllTools,
  registerToolsetMetaTools,
  disableNonCoreTools,
} from './tools/toolset-manager.js';
import { VERSION } from '../shared/version.js';

const RELAY_URL = process.env.FIGCRAFT_RELAY_URL ?? 'ws://localhost:3055';
const CHANNEL = process.env.FIGCRAFT_CHANNEL ?? 'design-1';

const server = new McpServer({
  name: 'FigCraft',
  version: VERSION,
});

const bridge = new Bridge(RELAY_URL, CHANNEL);
setBridgeTokenProvider(() => bridge.getApiToken());

// ─── Register tools ───

// 1. Register ALL tools (captures handles for enable/disable)
registerAllTools(server, bridge);

// 2. Register meta tools (load_toolset, unload_toolset, list_toolsets)
registerToolsetMetaTools(server);

// 3. Disable non-core tools (keeps only ~30 active)
disableNonCoreTools(server);

// 4. Register prompts
registerPrompts(server);

// ─── Start ───

async function main(): Promise<void> {
  // Try connecting to an existing relay; if unavailable, start one in-process
  try {
    await bridge.connect();
    console.error('[FigCraft mcp] connected to existing relay');
  } catch {
    console.error('[FigCraft mcp] no relay found, starting embedded relay...');
    try {
      const { port } = await startRelay();
      bridge.setRelayUrl(`ws://localhost:${port}`);
      await bridge.connect();
      console.error(`[FigCraft mcp] embedded relay started on port ${port}`);
    } catch (relayErr) {
      // Port may be occupied by another relay instance — retry connection
      console.error('[FigCraft mcp] embedded relay failed, retrying connection...');
      try {
        await bridge.connect();
      } catch (finalErr) {
        console.error('[FigCraft mcp] could not connect to relay:', finalErr instanceof Error ? finalErr.message : finalErr);
      }
    }
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[FigCraft mcp] MCP server running (stdio)');
}

main().catch((err) => {
  console.error('[FigCraft mcp] Fatal:', err);
  process.exit(1);
});

// Graceful shutdown
function shutdown(): void {
  console.error('[FigCraft mcp] shutting down...');
  bridge.disconnect();
  server.close().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
