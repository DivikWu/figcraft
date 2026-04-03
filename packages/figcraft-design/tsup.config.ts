import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { defineConfig } from 'tsup';

/** Design rule skills → strip frontmatter → write as plain .md to dist */
const DESIGN_RULE_SKILLS = [
  { skill: 'design-guardian', out: 'design-guardian.md' },
  { skill: 'design-creator', out: 'design-creator.md' },
] as const;

// Node built-in modules and CJS deps must stay external in ESM bundles.
const nodeExternals = [...builtinModules, ...builtinModules.map((m) => `node:${m}`), 'ws'];

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['esm'],
  target: 'node20',
  sourcemap: true,
  clean: true,
  noExternal: ['@figcraft/core-mcp', '@figcraft/relay', '@figcraft/shared'],
  external: nodeExternals,
  banner: { js: '#!/usr/bin/env node' },
  onSuccess: async () => {
    const destDir = 'dist';
    mkdirSync(destDir, { recursive: true });
    const skillsDir = '../../skills';
    for (const { skill, out } of DESIGN_RULE_SKILLS) {
      const raw = readFileSync(`${skillsDir}/${skill}/SKILL.md`, 'utf-8');
      const content = raw.replace(/^---[\s\S]*?---\s*/, ''); // strip frontmatter
      writeFileSync(`${destDir}/${out}`, content);
    }
  },
});
