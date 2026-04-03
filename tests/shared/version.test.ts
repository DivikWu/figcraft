/**
 * Version consistency tests — ensures all version references match package.json.
 * Also checks that generated files are in sync with schema/tools.yaml.
 */

import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PLUGIN_VERSION } from '../../packages/adapter-figma/src/constants.js';
import { VERSION } from '../../packages/shared/src/version.js';

const pkgVersion = JSON.parse(readFileSync('package.json', 'utf-8')).version;
const GENERATED_OUTPUTS = [
  {
    label: 'core-mcp',
    generated: 'packages/core-mcp/src/tools/_generated.ts',
    registry: 'packages/core-mcp/src/tools/_registry.ts',
    contracts: 'packages/core-mcp/src/tools/_contracts.ts',
  },
] as const;

describe('version consistency', () => {
  it('shared VERSION matches package.json', () => {
    expect(VERSION).toBe(pkgVersion);
  });

  it('PLUGIN_VERSION re-exports shared VERSION', () => {
    expect(PLUGIN_VERSION).toBe(pkgVersion);
  });

  it('no hardcoded version strings remain in source files', () => {
    // Verify ping.ts imports from shared instead of hardcoding
    const pingSource = readFileSync('packages/core-mcp/src/tools/ping.ts', 'utf-8');
    expect(pingSource).toContain("from '@figcraft/shared'");
    expect(pingSource).not.toMatch(/const SERVER_VERSION\s*=\s*'/);

    // Verify index.ts imports from shared instead of hardcoding
    const indexSource = readFileSync('packages/core-mcp/src/index.ts', 'utf-8');
    expect(indexSource).toContain("from '@figcraft/shared'");
    expect(indexSource).not.toMatch(/version:\s*'/);
  });
});

describe('generated file freshness', () => {
  it.each(GENERATED_OUTPUTS)('$label generated files are not older than schema/tools.yaml', ({
    generated,
    registry,
    contracts,
  }) => {
    const yamlMtime = statSync('schema/tools.yaml').mtimeMs;
    const genMtime = statSync(generated).mtimeMs;
    const regMtime = statSync(registry).mtimeMs;
    const contractMtime = statSync(contracts).mtimeMs;
    // Generated files should be at least as recent as the YAML source.
    // If this fails, run: npm run schema
    expect(genMtime).toBeGreaterThanOrEqual(yamlMtime - 1000); // 1s tolerance for filesystem
    expect(regMtime).toBeGreaterThanOrEqual(yamlMtime - 1000);
    expect(contractMtime).toBeGreaterThanOrEqual(yamlMtime - 1000);
  });
});
