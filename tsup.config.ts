import { defineConfig } from 'tsup';
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PROMPT_FILES = ['design-guardian.md', 'design-creator.md'] as const;

export default defineConfig([
  // MCP Server
  {
    entry: ['packages/figcraft-design/src/index.ts'],
    outDir: 'dist/mcp-server',
    format: ['esm'],
    target: 'node20',
    sourcemap: true,
    clean: true,
    banner: { js: '#!/usr/bin/env node' },
    onSuccess: async () => {
      const destDir = 'dist/mcp-server';
      mkdirSync(destDir, { recursive: true });
      for (const f of PROMPT_FILES) {
        copyFileSync(require.resolve(`@figcraft/core-mcp/prompts/${f}`), `${destDir}/${f}`);
      }
    },
  },
  // WebSocket Relay
  {
    entry: ['packages/relay/src/index.ts'],
    outDir: 'dist/relay',
    format: ['esm'],
    target: 'node20',
    sourcemap: true,
    clean: true,
  },
]);
