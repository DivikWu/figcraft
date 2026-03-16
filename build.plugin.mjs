import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'fs';

// Build plugin code.ts → dist/plugin/code.js (IIFE for Figma sandbox)
await build({
  entryPoints: ['src/plugin/code.ts'],
  outfile: 'dist/plugin/code.js',
  bundle: true,
  format: 'iife',
  target: 'es2017',
  platform: 'browser',
  sourcemap: false,
});

// Copy ui.html
mkdirSync('dist/plugin', { recursive: true });
cpSync('src/plugin/ui.html', 'dist/plugin/ui.html');

// Write manifest with paths relative to dist/plugin/
const manifest = JSON.parse(readFileSync('manifest.json', 'utf-8'));
manifest.main = 'code.js';
manifest.ui = 'ui.html';
writeFileSync('dist/plugin/manifest.json', JSON.stringify(manifest, null, 2));

console.log('Plugin built → dist/plugin/');
