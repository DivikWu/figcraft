import { defineConfig } from 'tsup';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { builtinModules } from 'node:module';

/** Design rule skills → strip frontmatter → write as plain .md to dist */
const DESIGN_RULE_SKILLS = [
  { skill: 'ui-ux-fundamentals', out: 'ui-ux-fundamentals.md' },
  { skill: 'design-guardian', out: 'design-guardian.md' },
  { skill: 'design-creator', out: 'design-creator.md' },
] as const;

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
      for (const { skill, out } of DESIGN_RULE_SKILLS) {
        const raw = readFileSync(`skills/${skill}/SKILL.md`, 'utf-8');
        const content = raw.replace(/^---[\s\S]*?---\s*/, ''); // strip frontmatter
        writeFileSync(`${destDir}/${out}`, content);
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
