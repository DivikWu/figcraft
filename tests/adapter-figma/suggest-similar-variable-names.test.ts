/**
 * Tests for suggestSimilarVariableNames — the "did you mean?" fuzzy helper
 * used by applyFill/applyStroke to enrich "variable not found" hints with
 * concrete alternatives from the local variable pool.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { suggestSimilarVariableNames } from '../../packages/adapter-figma/src/utils/design-context.js';

interface MockVariable {
  name: string;
  resolvedType: 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN';
}

function stubFigmaWithVars(vars: MockVariable[]) {
  vi.stubGlobal('figma', {
    variables: {
      getLocalVariablesAsync: async (type?: string) => (type ? vars.filter((v) => v.resolvedType === type) : vars),
    },
  });
}

describe('suggestSimilarVariableNames', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns empty array when no local variables exist', async () => {
    stubFigmaWithVars([]);
    const result = await suggestSimilarVariableNames('text/primary', 'COLOR');
    expect(result).toEqual([]);
  });

  it('suggests names that share substrings with the requested name', async () => {
    stubFigmaWithVars([
      { name: 'text/primary', resolvedType: 'COLOR' },
      { name: 'text/secondary', resolvedType: 'COLOR' },
      { name: 'background/primary', resolvedType: 'COLOR' },
      { name: 'spacing/md', resolvedType: 'FLOAT' },
    ]);
    // "text/primry" (typo) should surface "text/primary" via token overlap.
    const result = await suggestSimilarVariableNames('text/primry', 'COLOR');
    expect(result[0]).toBe('text/primary');
  });

  it('respects the type filter — only suggests variables of the requested type', async () => {
    stubFigmaWithVars([
      { name: 'text/primary', resolvedType: 'COLOR' },
      { name: 'text/primary', resolvedType: 'FLOAT' }, // same name, wrong type
    ]);
    const result = await suggestSimilarVariableNames('text/prim', 'COLOR');
    // Only the COLOR one should appear.
    expect(result).toEqual(['text/primary']);
  });

  it('prioritizes substring containment over pure token overlap', async () => {
    stubFigmaWithVars([
      { name: 'colors/text/primary', resolvedType: 'COLOR' },
      { name: 'text/inverse', resolvedType: 'COLOR' },
    ]);
    // "text/primary" is a substring of "colors/text/primary" → +100
    // vs "text/inverse" which only shares one token → +10
    const result = await suggestSimilarVariableNames('text/primary', 'COLOR');
    expect(result[0]).toBe('colors/text/primary');
  });

  it('excludes exact matches (they are not "suggestions")', async () => {
    stubFigmaWithVars([
      { name: 'text/primary', resolvedType: 'COLOR' },
      { name: 'text/secondary', resolvedType: 'COLOR' },
    ]);
    // If the agent asked for "text/primary" and it exists, it shouldn't show
    // up as a "did you mean" — the caller handles exact matches first.
    const result = await suggestSimilarVariableNames('text/primary', 'COLOR');
    expect(result).not.toContain('text/primary');
    expect(result[0]).toBe('text/secondary'); // token overlap on "text"
  });

  it('caps output at the requested limit', async () => {
    stubFigmaWithVars([
      { name: 'text/primary', resolvedType: 'COLOR' },
      { name: 'text/secondary', resolvedType: 'COLOR' },
      { name: 'text/disabled', resolvedType: 'COLOR' },
      { name: 'text/inverse', resolvedType: 'COLOR' },
      { name: 'text/accent', resolvedType: 'COLOR' },
    ]);
    const result = await suggestSimilarVariableNames('text', 'COLOR', 3);
    expect(result.length).toBe(3);
  });

  it('returns empty array on empty requested name', async () => {
    stubFigmaWithVars([{ name: 'text/primary', resolvedType: 'COLOR' }]);
    const result = await suggestSimilarVariableNames('', 'COLOR');
    expect(result).toEqual([]);
  });

  it('returns empty array when figma API throws', async () => {
    vi.stubGlobal('figma', {
      variables: {
        getLocalVariablesAsync: async () => {
          throw new Error('plugin disconnected');
        },
      },
    });
    const result = await suggestSimilarVariableNames('text/primary', 'COLOR');
    expect(result).toEqual([]);
  });

  it('handles dash and underscore separators in addition to slash', async () => {
    stubFigmaWithVars([
      { name: 'button-primary-emphasis', resolvedType: 'COLOR' },
      { name: 'background_card', resolvedType: 'COLOR' },
    ]);
    const result = await suggestSimilarVariableNames('button/primary', 'COLOR');
    expect(result[0]).toBe('button-primary-emphasis'); // shares 2 tokens
  });
});
