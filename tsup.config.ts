import { defineConfig } from 'tsup';
import { copyFileSync, mkdirSync } from 'node:fs';

export default defineConfig([
  // MCP Server
  {
    entry: ['src/mcp-server/index.ts'],
    outDir: 'dist/mcp-server',
    format: ['esm'],
    target: 'node20',
    sourcemap: true,
    clean: true,
    banner: { js: '#!/usr/bin/env node' },
    onSuccess: async () => {
      // Copy design rule .md files for runtime loading by prompts
      const srcDir = 'src/mcp-server/prompts';
      const destDir = 'dist/mcp-server';
      mkdirSync(destDir, { recursive: true });
      for (const f of ['design-guardian.md', 'design-creator.md']) {
        copyFileSync(`${srcDir}/${f}`, `${destDir}/${f}`);
      }
    },
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
