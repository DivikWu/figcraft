import { defineConfig } from 'tsup';
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PROMPT_FILES = ['design-guardian.md', 'design-creator.md'] as const;

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['esm'],
  target: 'node20',
  sourcemap: true,
  clean: true,
  noExternal: ['@figcraft/core-mcp', '@figcraft/relay', '@figcraft/shared'],
  banner: { js: '#!/usr/bin/env node' },
  onSuccess: async () => {
    const destDir = 'dist';
    mkdirSync(destDir, { recursive: true });
    for (const f of PROMPT_FILES) {
      copyFileSync(require.resolve(`@figcraft/core-mcp/prompts/${f}`), `${destDir}/${f}`);
    }
  },
});
