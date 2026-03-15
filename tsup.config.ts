import { defineConfig } from 'tsup';

export default defineConfig([
  // MCP Server
  {
    entry: ['src/mcp-server/index.ts'],
    outDir: 'dist/mcp-server',
    format: ['esm'],
    target: 'node20',
    sourcemap: true,
    clean: true,
  },
  // WebSocket Relay
  {
    entry: ['src/relay/index.ts'],
    outDir: 'dist/relay',
    format: ['esm'],
    target: 'node20',
    sourcemap: true,
    clean: true,
  },
]);
