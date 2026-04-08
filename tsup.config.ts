import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { defineConfig } from 'tsup';

/** Design rule skills → strip frontmatter → write as plain .md to dist */
const DESIGN_RULE_SKILLS = [
  { skill: 'ui-ux-fundamentals', out: 'ui-ux-fundamentals.md' },
  { skill: 'design-guardian', out: 'design-guardian.md' },
  { skill: 'design-creator', out: 'design-creator.md' },
] as const;

/** Creation guide skills → strip frontmatter + IDE sections → write as plain .md to dist */
const CREATION_GUIDE_SKILLS = [
  { skill: 'multi-screen-flow', out: 'multi-screen.md' },
  { skill: 'responsive-design', out: 'responsive.md' },
  { skill: 'content-states', out: 'content-states.md' },
  { skill: 'iconography', out: 'iconography.md' },
  { skill: 'platform-ios', out: 'platform-ios.md' },
  { skill: 'platform-android', out: 'platform-android.md' },
  { skill: 'ux-writing', out: 'ux-writing.md' },
] as const;

// SYNC: stripSkillSections logic is duplicated in creation-guide.ts and figcraft-design/tsup.config.ts
// Guarded by tests/contracts/skill-sync.test.ts — keep all three in sync.
const SECTIONS_TO_STRIP = ['Skill Boundaries', 'Design Direction', 'On-Demand Guide'];

function stripSkillSections(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (line.startsWith('## ')) {
      const heading = line.replace(/^## /, '').trim();
      skipping = SECTIONS_TO_STRIP.includes(heading);
      if (skipping) continue;
    }
    if (!skipping) result.push(line);
  }
  return result
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Node built-in modules must stay external in ESM bundles to avoid
// "Dynamic require of X is not supported" errors from CJS deps like `ws`.
const nodeExternals = [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  'ws', // CJS package — must not be bundled into ESM output
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
      // Design rule skills: strip frontmatter only
      for (const { skill, out } of DESIGN_RULE_SKILLS) {
        const raw = readFileSync(`skills/${skill}/SKILL.md`, 'utf-8');
        const content = raw.replace(/^---[\s\S]*?---\s*/, ''); // strip frontmatter
        writeFileSync(`${destDir}/${out}`, content);
      }
      // Creation guide skills: strip frontmatter + IDE-only sections
      for (const { skill, out } of CREATION_GUIDE_SKILLS) {
        const raw = readFileSync(`skills/${skill}/SKILL.md`, 'utf-8');
        const stripped = raw.replace(/^---[\s\S]*?---\s*/, ''); // strip frontmatter
        writeFileSync(`${destDir}/${out}`, stripSkillSections(stripped));
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
