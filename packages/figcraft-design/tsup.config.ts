import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { defineConfig } from 'tsup';

/** Design rule skills → strip frontmatter → write as plain .md to dist */
const DESIGN_RULE_SKILLS = [
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

// SYNC: stripSkillSections logic is duplicated in root tsup.config.ts and creation-guide.ts
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
    // Design rule skills: strip frontmatter only
    for (const { skill, out } of DESIGN_RULE_SKILLS) {
      const raw = readFileSync(`${skillsDir}/${skill}/SKILL.md`, 'utf-8');
      const content = raw.replace(/^---[\s\S]*?---\s*/, ''); // strip frontmatter
      writeFileSync(`${destDir}/${out}`, content);
    }
    // Creation guide skills: strip frontmatter + IDE-only sections
    for (const { skill, out } of CREATION_GUIDE_SKILLS) {
      const raw = readFileSync(`${skillsDir}/${skill}/SKILL.md`, 'utf-8');
      const stripped = raw.replace(/^---[\s\S]*?---\s*/, ''); // strip frontmatter
      writeFileSync(`${destDir}/${out}`, stripSkillSections(stripped));
    }
  },
});
