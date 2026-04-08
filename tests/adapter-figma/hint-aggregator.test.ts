/**
 * Tests for hint aggregation — deduplication, batching, type conversion.
 */

import { describe, expect, it } from 'vitest';
import type { Hint, StructuredHint } from '../../packages/adapter-figma/src/utils/hint-aggregator.js';
import {
  aggregateHints,
  legacyHintsToTyped,
  structuredHintsToTyped,
} from '../../packages/adapter-figma/src/utils/hint-aggregator.js';

// ─── aggregateHints ───

describe('aggregateHints', () => {
  it('returns empty array for empty input', () => {
    expect(aggregateHints([])).toEqual([]);
  });

  it('suppresses confirm hints', () => {
    const hints: Hint[] = [
      { type: 'confirm', message: 'layoutMode → VERTICAL' },
      { type: 'confirm', message: 'sizing → HUG' },
    ];
    expect(aggregateHints(hints)).toEqual([]);
  });

  it('keeps error hints as-is', () => {
    const hints: Hint[] = [{ type: 'error', message: 'Font not found: Inter Bold' }];
    const result = aggregateHints(hints);
    expect(result).toEqual(['Font not found: Inter Bold']);
  });

  it('deduplicates suggest/warn hints and shows count', () => {
    const hints: Hint[] = [
      { type: 'warn', message: "Style 'heading-lg' not found" },
      { type: 'warn', message: "Style 'body-md' not found" },
    ];
    const result = aggregateHints(hints);
    // Both match the same normalized key (quoted strings stripped)
    expect(result).toHaveLength(1);
    expect(result[0]).toMatch(/×2/);
  });

  it('batches hardcoded color hints into summary', () => {
    const hints: Hint[] = [
      { type: 'warn', message: 'Hardcoded color #FF0000 on fills' },
      { type: 'warn', message: 'Hardcoded color #00FF00 on fills' },
      { type: 'warn', message: 'Hardcoded color #FF0000 on strokes' },
    ];
    const result = aggregateHints(hints);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('#FF0000');
    expect(result[0]).toContain('#00FF00');
    expect(result[0]).toContain('fillVariableName');
  });

  it('upgrades hardcoded color warning in library mode', () => {
    const hints: Hint[] = [{ type: 'warn', message: 'Hardcoded color #FF0000 on fills' }];
    const result = aggregateHints(hints, { isLibraryMode: true });
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('LIBRARY MODE VIOLATION');
    expect(result[0]).toContain('#FF0000');
    expect(result[0]).toContain('search_design_system');
  });

  it('keeps gentle warning in creator mode (no library context)', () => {
    const hints: Hint[] = [{ type: 'warn', message: 'Hardcoded color #FF0000 on fills' }];
    const result = aggregateHints(hints, { isLibraryMode: false });
    expect(result).toHaveLength(1);
    expect(result[0]).not.toContain('LIBRARY MODE VIOLATION');
    expect(result[0]).toContain('fillVariableName');
  });

  it('handles mixed hint types', () => {
    const hints: Hint[] = [
      { type: 'confirm', message: 'inferred layout' },
      { type: 'error', message: 'critical error' },
      { type: 'suggest', message: 'consider auto-layout' },
    ];
    const result = aggregateHints(hints);
    expect(result).toContain('critical error');
    expect(result).toContain('consider auto-layout');
    expect(result).toHaveLength(2);
  });
});

// ─── structuredHintsToTyped ───

describe('structuredHintsToTyped', () => {
  it('maps deterministic to confirm type', () => {
    const hints: StructuredHint[] = [
      { confidence: 'deterministic', field: 'layoutMode', value: 'VERTICAL', reason: 'vertical children' },
    ];
    const result = structuredHintsToTyped(hints);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('confirm');
    expect(result[0].message).toContain('layoutMode');
  });

  it('maps ambiguous to warn type', () => {
    const hints: StructuredHint[] = [
      { confidence: 'ambiguous', field: 'sizing', value: 'FILL', reason: 'parent has auto-layout' },
    ];
    const result = structuredHintsToTyped(hints);
    expect(result[0].type).toBe('warn');
  });
});

// ─── legacyHintsToTyped ───

describe('legacyHintsToTyped', () => {
  it('parses [deterministic] prefix to confirm', () => {
    const result = legacyHintsToTyped(['[deterministic] layoutMode set to VERTICAL']);
    expect(result[0].type).toBe('confirm');
    expect(result[0].message).toBe('layoutMode set to VERTICAL');
  });

  it('parses [ambiguous] prefix to warn', () => {
    const result = legacyHintsToTyped(['[ambiguous] sizing may be wrong']);
    expect(result[0].type).toBe('warn');
    expect(result[0].message).toBe('sizing may be wrong');
  });

  it('defaults to suggest for unprefixed hints', () => {
    const result = legacyHintsToTyped(['consider using auto-layout']);
    expect(result[0].type).toBe('suggest');
    expect(result[0].message).toBe('consider using auto-layout');
  });
});
