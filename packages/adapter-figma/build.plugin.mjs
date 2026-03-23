import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(PACKAGE_ROOT, '../..');
const DIST_PLUGIN_DIR = resolve(REPO_ROOT, 'dist/plugin');
const ENTRY = resolve(PACKAGE_ROOT, 'src/code.ts');
const UI_HTML = resolve(PACKAGE_ROOT, 'src/ui.html');
const MANIFEST_SOURCE = resolve(PACKAGE_ROOT, 'manifest.base.json');
const ROOT_MANIFEST = resolve(REPO_ROOT, 'manifest.json');

await build({
  entryPoints: [ENTRY],
  outfile: resolve(DIST_PLUGIN_DIR, 'code.js'),
  bundle: true,
  format: 'iife',
  target: 'es2017',
  platform: 'browser',
  sourcemap: false,
});

mkdirSync(DIST_PLUGIN_DIR, { recursive: true });
cpSync(UI_HTML, resolve(DIST_PLUGIN_DIR, 'ui.html'));

const manifestTemplate = JSON.parse(readFileSync(MANIFEST_SOURCE, 'utf-8'));
const rootManifest = {
  ...manifestTemplate,
  main: 'dist/plugin/code.js',
  ui: 'dist/plugin/ui.html',
};
const distManifest = {
  ...manifestTemplate,
  main: 'code.js',
  ui: 'ui.html',
};

writeFileSync(ROOT_MANIFEST, JSON.stringify(rootManifest, null, 2));
writeFileSync(resolve(DIST_PLUGIN_DIR, 'manifest.json'), JSON.stringify(distManifest, null, 2));

console.log('Plugin built → dist/plugin/');
