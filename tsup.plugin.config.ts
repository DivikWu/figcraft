import { defineConfig } from 'tsup';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

export default defineConfig({
  entry: { code: 'src/plugin/code.ts' },
  outDir: 'dist/plugin',
  format: ['iife'],
  target: 'es2022',
  sourcemap: false,
  clean: true,
  noExternal: [/.*/],
  // Copy ui.html and manifest.json to dist/plugin
  onSuccess: async () => {
    mkdirSync('dist/plugin', { recursive: true });
    writeFileSync('dist/plugin/ui.html', readFileSync('src/plugin/ui.html'));
    // Write manifest with paths relative to dist/plugin/
    const manifest = JSON.parse(readFileSync('manifest.json', 'utf-8'));
    manifest.main = 'code.global.js';
    manifest.ui = 'ui.html';
    writeFileSync('dist/plugin/manifest.json', JSON.stringify(manifest, null, 2));
  },
});
