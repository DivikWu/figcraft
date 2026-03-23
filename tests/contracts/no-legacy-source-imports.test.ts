import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const PACKAGE_ROOT = join(ROOT, 'packages');
const CODE_EXTENSIONS = new Set(['.ts', '.mts', '.js', '.mjs']);
const FORBIDDEN_PATTERNS = [
  'src/mcp-server/',
  'src/plugin/',
  'src/shared/',
  'src/relay/',
  '../shared/src/',
  '../../shared/src/',
  '../../../shared/src/',
  '../relay/src/',
  '../../relay/src/',
  '../../../relay/src/',
  '../core-mcp/src/',
  '../../core-mcp/src/',
  '../../../core-mcp/src/',
  '../quality-engine/src/',
  '../../quality-engine/src/',
  '../../../quality-engine/src/',
] as const;

function walkFiles(dir: string): string[] {
  const entries = readdirSync(dir).sort();
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry === 'dist' || entry === 'node_modules') {
        continue;
      }
      files.push(...walkFiles(fullPath));
      continue;
    }

    if (fullPath.includes('/src/') && [...CODE_EXTENSIONS].some((ext) => entry.endsWith(ext))) {
      files.push(fullPath);
    }
  }

  return files;
}

describe('package-owned source boundaries', () => {
  it('does not let package-owned source files import legacy src shims', () => {
    const offenders: string[] = [];

    for (const file of walkFiles(PACKAGE_ROOT)) {
      const source = readFileSync(file, 'utf-8');
      if (FORBIDDEN_PATTERNS.some((pattern) => source.includes(pattern))) {
        offenders.push(relative(ROOT, file));
      }
    }

    expect(offenders).toEqual([]);
  });
});
