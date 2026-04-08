import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Skill format validation — ensures all SKILL.md files have well-formed
 * frontmatter with required fields (name, description) and non-trivial content.
 *
 * Catches issues like duplicate YAML keys, missing descriptions, or
 * name/directory mismatches before they reach production.
 */
const skillDirs = readdirSync('skills', { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

describe('skill format validation', () => {
  for (const dir of skillDirs) {
    describe(dir, () => {
      const path = `skills/${dir}/SKILL.md`;
      let content: string;
      try {
        content = readFileSync(path, 'utf-8');
      } catch {
        it('SKILL.md exists', () => {
          expect.fail(`${path} does not exist`);
        });
        return;
      }

      it('has valid YAML frontmatter', () => {
        expect(content.startsWith('---\n'), 'must start with ---').toBe(true);
        const endIdx = content.indexOf('\n---', 4);
        expect(endIdx, 'must have closing ---').toBeGreaterThan(0);

        const frontmatter = content.slice(4, endIdx);
        // No duplicate top-level keys
        const keys = frontmatter.match(/^[\w-]+(?=\s*:)/gm) ?? [];
        const unique = new Set(keys);
        expect(keys.length, `duplicate frontmatter keys: ${keys.filter((k, i) => keys.indexOf(k) !== i)}`).toBe(
          unique.size,
        );
      });

      it('has name matching directory', () => {
        const match = content.match(/^name:\s*(.+)$/m);
        expect(match, 'must have name field').not.toBeNull();
        const name = match![1].trim().replace(/^["']|["']$/g, '');
        expect(name).toBe(dir);
      });

      it('has non-empty description', () => {
        const match = content.match(/^description:\s*(.+)$/m);
        expect(match, 'must have description field').not.toBeNull();
        const desc = match![1].trim().replace(/^["']|["']$/g, '');
        expect(desc.length, 'description too short').toBeGreaterThan(10);
      });

      it('has content after frontmatter', () => {
        const endIdx = content.indexOf('\n---', 4);
        const body = content.slice(endIdx + 4).trim();
        expect(body.length, 'body content too short').toBeGreaterThan(50);
      });
    });
  }
});
