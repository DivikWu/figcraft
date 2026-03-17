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
import { registerNodeTools } from './tools/nodes.js';
import { registerVariableTools } from './tools/variables.js';
import { registerStyleTools } from './tools/styles.js';
import { registerLibraryTools } from './tools/library.js';
import { registerLibraryStyleTools } from './tools/library-styles.js';
import { registerExportTools } from './tools/export.js';
import { registerWriteNodeTools } from './tools/write-nodes.js';
import { registerTokenTools } from './tools/tokens.js';
import { registerComponentTools } from './tools/components.js';
import { registerStorageTools } from './tools/storage.js';
import { registerLintTools } from './tools/lint.js';
import { registerAnnotationTools } from './tools/annotations.js';
import { registerModeTools } from './tools/mode.js';
import { registerChannelTools } from './tools/channel.js';
import { registerWriteVariableTools } from './tools/write-variables.js';
import { registerWriteStyleTools } from './tools/write-styles.js';
import { registerScanTools } from './tools/scan.js';
import { registerPageTools } from './tools/pages.js';
import { registerPrototypeTools } from './tools/prototype.js';
import { registerImageVectorTools } from './tools/image-vector.js';
import { registerSelectionTools } from './tools/selection.js';
import { registerPrompts } from './prompts/index.js';
import { registerAuthTools } from './tools/auth.js';
import { setBridgeTokenProvider } from './auth.js';
import { startRelay } from '../relay/index.js';

const RELAY_URL = process.env.FIGCRAFT_RELAY_URL ?? 'ws://localhost:3055';
const CHANNEL = process.env.FIGCRAFT_CHANNEL ?? 'figcraft';

const server = new McpServer({
  name: 'FigCraft',
  version: '0.1.0',
});

const bridge = new Bridge(RELAY_URL, CHANNEL);
setBridgeTokenProvider(() => bridge.getApiToken());

// ─── Register tools ───

registerPing(server, bridge);
registerAuthTools(server);

// P1: read tools
registerNodeTools(server, bridge);
registerVariableTools(server, bridge);
registerStyleTools(server, bridge);
registerLibraryTools(server, bridge);
registerLibraryStyleTools(server, bridge);
registerExportTools(server, bridge);

// P2: write tools
registerWriteNodeTools(server, bridge);
registerTokenTools(server, bridge);
registerComponentTools(server, bridge);
registerStorageTools(server, bridge);
registerWriteVariableTools(server, bridge);
registerWriteStyleTools(server, bridge);
registerPageTools(server, bridge);
registerSelectionTools(server, bridge);

// P3: lint tools
registerLintTools(server, bridge);
registerAnnotationTools(server, bridge);

// P4: mode + channel + scan + prompts
registerModeTools(server, bridge);
registerChannelTools(server, bridge);
registerScanTools(server, bridge);
registerPrototypeTools(server, bridge);
registerImageVectorTools(server, bridge);
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
process.on('SIGINT', () => {
  bridge.disconnect();
  process.exit(0);
});
