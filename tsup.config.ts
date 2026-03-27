import { defineConfig } from 'tsup';
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { builtinModules } from 'node:module';

const require = createRequire(import.meta.url);
const PROMPT_FILES = ['design-guardian.md', 'design-creator.md'] as const;

// Node built-in modules must stay external in ESM bundles to avoid
// "Dynamic require of X is not supported" errors from CJS deps like `ws`.
const nodeExternals = [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  'ws',  // CJS package — must not be bundled into ESM output
];

export default defineConfig([
  // MCP Server
  {
    entry: ['packages/figcraft-design/src/index.ts'],
    outDir: 'dist/mcp-server',
    format: ['esm'],
    target: 'node20',
    sourcemap: true,
    clean: true,
    noExternal: [],
    external: nodeExternals,
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
    noExternal: [],
    external: nodeExternals,
  },
]);
