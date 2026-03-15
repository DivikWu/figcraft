import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/mcp-server/index.ts'],
    outDir: 'dist/mcp-server',
    format: ['esm'],
    target: 'node20',
    sourcemap: true,
    clean: true,
  },
  {
    entry: ['src/relay/index.ts'],
    outDir: 'dist/relay',
    format: ['esm'],
    target: 'node20',
    sourcemap: true,
    clean: true,
  },
]);
