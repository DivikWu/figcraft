import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Skill registration sync — guards that runtime loading, build-time fallback
 * generation, and contract tests all reference the same set of skills.
 *
 * BUG history: ux-writing was added to creation-guide.ts runtime loading but
 * missed in both tsup.config.ts files, causing silent empty-string fallback
 * in published packages.
 */
describe('skill registration sync', () => {
  const extractSkillNames = (content: string, pattern: RegExp): string[] => {
    const matches = [...content.matchAll(pattern)];
    return matches.map((m) => m[1]).sort();
  };

  const rootTsup = readFileSync('tsup.config.ts', 'utf-8');
  const pkgTsup = readFileSync('packages/figcraft-design/tsup.config.ts', 'utf-8');
  const creationGuide = readFileSync('packages/core-mcp/src/tools/creation-guide.ts', 'utf-8');

  it('root tsup CREATION_GUIDE_SKILLS covers all creation-guide.ts loadSkillGuide skills', () => {
    // Extract skill names from CREATION_GUIDE_SKILLS array in tsup.config.ts
    const tsupSkills = extractSkillNames(rootTsup, /skill:\s*'([^']+)'/g).filter(
      (s) => !['ui-ux-fundamentals', 'design-guardian', 'design-creator'].includes(s),
    );

    // Extract skill names from loadSkillGuide() calls in creation-guide.ts
    const guideSkills = extractSkillNames(creationGuide, /loadSkillGuide\(\s*'([^']+)'/g);

    expect(tsupSkills).toEqual(guideSkills);
  });

  it('root tsup CREATION_GUIDE_SKILLS matches figcraft-design tsup', () => {
    const rootSkills = extractSkillNames(rootTsup, /skill:\s*'([^']+)'/g).filter(
      (s) => !['ui-ux-fundamentals', 'design-guardian', 'design-creator'].includes(s),
    );
    const pkgSkills = extractSkillNames(pkgTsup, /skill:\s*'([^']+)'/g).filter(
      (s) => !['design-guardian', 'design-creator'].includes(s),
    );

    expect(rootSkills).toEqual(pkgSkills);
  });

  it('SECTIONS_TO_STRIP arrays are identical across all three locations', () => {
    const files = [rootTsup, pkgTsup, creationGuide];
    const pattern = /SECTIONS_TO_STRIP\s*=\s*\[([^\]]+)\]/;
    const values = files.map((content) => {
      const match = content.match(pattern);
      return match?.[1]?.replace(/\s+/g, ' ').trim();
    });
    expect(values[0]).toBeTruthy();
    expect(values[0]).toBe(values[1]);
    expect(values[0]).toBe(values[2]);
  });
});
