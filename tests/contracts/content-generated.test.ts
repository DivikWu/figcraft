import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('content-generated freshness', () => {
  it('_guides.ts matches content/guides/*.md (run `npm run content` if stale)', () => {
    const current = readFileSync('packages/core-mcp/src/tools/_guides.ts', 'utf-8');
    execSync('npx tsx scripts/compile-content.ts', { stdio: 'pipe' });
    const fresh = readFileSync('packages/core-mcp/src/tools/_guides.ts', 'utf-8');
    expect(current).toBe(fresh);
  });

  it('_prompts.ts matches content/prompts/*.yaml', () => {
    const current = readFileSync('packages/core-mcp/src/prompts/_prompts.ts', 'utf-8');
    execSync('npx tsx scripts/compile-content.ts', { stdio: 'pipe' });
    const fresh = readFileSync('packages/core-mcp/src/prompts/_prompts.ts', 'utf-8');
    expect(current).toBe(fresh);
  });

  it('_templates.ts matches content/templates/*.yaml', () => {
    const current = readFileSync('packages/core-mcp/src/tools/_templates.ts', 'utf-8');
    execSync('npx tsx scripts/compile-content.ts', { stdio: 'pipe' });
    const fresh = readFileSync('packages/core-mcp/src/tools/_templates.ts', 'utf-8');
    expect(current).toBe(fresh);
  });

  it('every content/guides/*.md has a corresponding key in _guides.ts', () => {
    const guides = readFileSync('packages/core-mcp/src/tools/_guides.ts', 'utf-8');
    const files = readdirSync('content/guides').filter((f) => f.endsWith('.md'));
    for (const file of files) {
      const key = file.replace('.md', '').replace(/-/g, '_').toUpperCase();
      expect(guides).toContain(key);
    }
  });

  it('every content/prompts/*.yaml has a corresponding entry in _prompts.ts', () => {
    const prompts = readFileSync('packages/core-mcp/src/prompts/_prompts.ts', 'utf-8');
    const files = readdirSync('content/prompts').filter((f) => f.endsWith('.yaml'));
    for (const file of files) {
      const name = file.replace('.yaml', '');
      expect(prompts).toContain(`"${name}"`);
    }
  });

  it('every content/templates/*.yaml has a corresponding entry in _templates.ts', () => {
    const templates = readFileSync('packages/core-mcp/src/tools/_templates.ts', 'utf-8');
    const files = readdirSync('content/templates').filter((f) => f.endsWith('.yaml'));
    for (const file of files) {
      const name = file.replace('.yaml', '');
      expect(templates).toContain(`"${name}"`);
    }
  });

  it('skill-sourced creation guides exist and are readable', () => {
    const skillGuides = [
      'skills/multi-screen-flow/SKILL.md',
      'skills/responsive-design/SKILL.md',
      'skills/content-states/SKILL.md',
      'skills/iconography/SKILL.md',
      'skills/platform-ios/SKILL.md',
      'skills/platform-android/SKILL.md',
      'skills/ux-writing/SKILL.md',
    ];
    for (const path of skillGuides) {
      expect(existsSync(path)).toBe(true);
      const content = readFileSync(path, 'utf-8');
      expect(content.length).toBeGreaterThan(100);
      // Must have frontmatter
      expect(content.startsWith('---')).toBe(true);
    }
  });

  it('content/ directory structure is complete', () => {
    expect(existsSync('content/guides')).toBe(true);
    expect(existsSync('content/prompts')).toBe(true);
    expect(existsSync('content/templates')).toBe(true);
    expect(readdirSync('content/guides').filter((f) => f.endsWith('.md')).length).toBeGreaterThanOrEqual(3);
    expect(readdirSync('content/prompts').filter((f) => f.endsWith('.yaml')).length).toBeGreaterThanOrEqual(9);
    expect(readdirSync('content/templates').filter((f) => f.endsWith('.yaml')).length).toBeGreaterThanOrEqual(9);
  });
});
