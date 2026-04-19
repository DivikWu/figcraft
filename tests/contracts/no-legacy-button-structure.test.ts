/**
 * CI guard: prevent re-introduction of the retired `button-structure` rule.
 *
 * The monolithic `button-structure.ts` was retired in favor of variant-aware
 * rules (`button-solid-structure`, `button-outline-structure`, ... ,
 * `link-standalone-structure`) because its unanchored name regex produced
 * false positives like TEXT "Sign in to continue shopping".
 *
 * If a commit resurrects the rule file or adds references to the old name in
 * source/content files, this test fails and surfaces the regression before
 * merge. Generated files, docs, and this guard itself are excluded.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..', '..');

const LEGACY_RULE_FILE = join(ROOT, 'packages/quality-engine/src/rules/structure/button-structure.ts');

/** File globs where a match is fatal. Relative to repo root. */
const SCANNED_DIRS = [
  'packages/quality-engine/src',
  'packages/adapter-figma/src',
  'packages/core-mcp/src',
  'content/templates',
  'content/guides',
  'content/prompts',
  'content/harness',
  'schema',
];

/** Filenames we explicitly exclude (historical records, generated artifacts, this guard). */
const EXCLUDED_FILES = new Set([
  'no-legacy-button-structure.test.ts',
  '_generated.ts',
  '_guides.ts',
  '_prompts.ts',
  '_templates.ts',
  '_harness.ts',
  '_help.ts', // auto-generated from schema
  '_registry.ts',
  '_contracts.ts',
]);

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (st.isFile() && !EXCLUDED_FILES.has(entry)) acc.push(full);
  }
  return acc;
}

describe('legacy button-structure: retired', () => {
  it('button-structure.ts source file is not present', () => {
    expect(existsSync(LEGACY_RULE_FILE)).toBe(false);
  });

  it('no source file references the legacy rule name', () => {
    const offenders: Array<{ file: string; lines: string[] }> = [];
    for (const dir of SCANNED_DIRS) {
      for (const file of walk(join(ROOT, dir))) {
        const text = readFileSync(file, 'utf8');
        if (!text.includes('button-structure')) continue;
        if (text.includes('buttonStructureRule')) {
          offenders.push({ file: relative(ROOT, file), lines: ['buttonStructureRule import/usage'] });
          continue;
        }
        const hits = text
          .split('\n')
          .map((line, i) => ({ line: line.trim(), n: i + 1 }))
          .filter(({ line }) => /['"`]button-structure['"`:,)\]]/.test(line))
          .map(({ n, line }) => `${n}: ${line}`);
        // Allow `button-structure-pre` (pre-validation shim in lint-inline.ts)
        const significantHits = hits.filter((h) => !h.includes('button-structure-pre'));
        if (significantHits.length > 0) {
          offenders.push({ file: relative(ROOT, file), lines: significantHits });
        }
      }
    }

    if (offenders.length > 0) {
      const msg = offenders.map((o) => `  ${o.file}\n${o.lines.map((l) => `    ${l}`).join('\n')}`).join('\n');
      throw new Error(
        `Found references to retired "button-structure" rule. Use the variant rules instead (button-solid-structure, button-outline-structure, ...):\n${msg}`,
      );
    }
  });
});
