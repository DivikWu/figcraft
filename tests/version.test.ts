/**
 * Version consistency test — ensures PLUGIN_VERSION matches package.json.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { PLUGIN_VERSION } from '../src/plugin/constants.js';

describe('version consistency', () => {
  it('PLUGIN_VERSION matches package.json version', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
    expect(PLUGIN_VERSION).toBe(pkg.version);
  });
});
