/**
 * Version consistency tests — ensures all version references match package.json.
 * Also checks that generated files are in sync with schema/tools.yaml.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'fs';
import { VERSION } from '../src/shared/version.js';
import { PLUGIN_VERSION } from '../src/plugin/constants.js';

const pkgVersion = JSON.parse(readFileSync('package.json', 'utf-8')).version;

describe('version consistency', () => {
  it('shared VERSION matches package.json', () => {
    expect(VERSION).toBe(pkgVersion);
  });

  it('PLUGIN_VERSION re-exports shared VERSION', () => {
    expect(PLUGIN_VERSION).toBe(pkgVersion);
  });

  it('no hardcoded version strings remain in source files', () => {
    // Verify ping.ts imports from shared instead of hardcoding
    const pingSource = readFileSync('src/mcp-server/tools/ping.ts', 'utf-8');
    expect(pingSource).toContain("from '../../shared/version.js'");
    expect(pingSource).not.toMatch(/const SERVER_VERSION\s*=\s*'/);

    // Verify index.ts imports from shared instead of hardcoding
    const indexSource = readFileSync('src/mcp-server/index.ts', 'utf-8');
    expect(indexSource).toContain("from '../shared/version.js'");
    expect(indexSource).not.toMatch(/version:\s*'/);
  });
});

describe('generated file freshness', () => {
  it('_generated.ts and _registry.ts are not older than schema/tools.yaml', () => {
    const yamlMtime = statSync('schema/tools.yaml').mtimeMs;
    const genMtime = statSync('src/mcp-server/tools/_generated.ts').mtimeMs;
    const regMtime = statSync('src/mcp-server/tools/_registry.ts').mtimeMs;
    // Generated files should be at least as recent as the YAML source.
    // If this fails, run: npm run schema
    expect(genMtime).toBeGreaterThanOrEqual(yamlMtime - 1000); // 1s tolerance for filesystem
    expect(regMtime).toBeGreaterThanOrEqual(yamlMtime - 1000);
  });
});
