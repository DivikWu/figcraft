/**
 * Tests for library fallback decisions tracking (I2) and migration context (N1).
 */

import { describe, expect, it } from 'vitest';
import type { Bridge, DesignDecisions } from '../../packages/core-mcp/src/bridge.js';
import { extractDesignDecisions } from '../../packages/core-mcp/src/tools/logic/design-decisions.js';

/** Minimal mock bridge with both designDecisions and libraryFallback support. */
function mockBridge(): Bridge & {
  _dd: DesignDecisions | null;
  _lfd: DesignDecisions | null;
  _migration: DesignDecisions | null;
} {
  const bridge = {
    _dd: null as DesignDecisions | null,
    _lfd: null as DesignDecisions | null,
    _migration: null as DesignDecisions | null,
    mergeDesignDecisions(partial: Partial<DesignDecisions>, target?: 'libraryFallback') {
      const field = target === 'libraryFallback' ? '_lfd' : '_dd';
      if (!bridge[field]) {
        bridge[field] = { fillsUsed: [], fontsUsed: [], radiusValues: [], spacingValues: [] };
      }
      const d = bridge[field]!;
      if (partial.fillsUsed) {
        for (const f of partial.fillsUsed) if (!d.fillsUsed.includes(f)) d.fillsUsed.push(f);
      }
      if (partial.fontsUsed) {
        for (const f of partial.fontsUsed) if (!d.fontsUsed.includes(f)) d.fontsUsed.push(f);
      }
      if (partial.radiusValues) {
        for (const v of partial.radiusValues) if (!d.radiusValues.includes(v)) d.radiusValues.push(v);
      }
      if (partial.spacingValues) {
        for (const v of partial.spacingValues) if (!d.spacingValues.includes(v)) d.spacingValues.push(v);
      }
      if (partial.elevationStyle) d.elevationStyle = partial.elevationStyle;
    },
    get designDecisions() {
      return bridge._dd;
    },
    saveMigrationContext() {
      if (bridge._dd) {
        bridge._migration = { ...bridge._dd };
      }
    },
    consumeMigrationContext() {
      const ctx = bridge._migration;
      bridge._migration = null;
      return ctx;
    },
  };
  return bridge as unknown as Bridge & {
    _dd: DesignDecisions | null;
    _lfd: DesignDecisions | null;
    _migration: DesignDecisions | null;
  };
}

describe('extractDesignDecisions with libraryFallback target', () => {
  it('routes to libraryFallback when target specified', () => {
    const b = mockBridge();
    extractDesignDecisions(b, { fill: '#FF0000' }, 'libraryFallback');
    expect(b._dd).toBeNull();
    expect(b._lfd?.fillsUsed).toEqual(['#FF0000']);
  });

  it('routes to default when no target specified', () => {
    const b = mockBridge();
    extractDesignDecisions(b, { fill: '#00FF00' });
    expect(b._dd?.fillsUsed).toEqual(['#00FF00']);
    expect(b._lfd).toBeNull();
  });

  it('accumulates independently for each target', () => {
    const b = mockBridge();
    extractDesignDecisions(b, { fill: '#FF0000' });
    extractDesignDecisions(b, { fill: '#0000FF' }, 'libraryFallback');
    expect(b._dd?.fillsUsed).toEqual(['#FF0000']);
    expect(b._lfd?.fillsUsed).toEqual(['#0000FF']);
  });

  it('deduplicates within libraryFallback', () => {
    const b = mockBridge();
    extractDesignDecisions(b, { fill: '#AABBCC' }, 'libraryFallback');
    extractDesignDecisions(b, { fill: '#aabbcc' }, 'libraryFallback');
    expect(b._lfd?.fillsUsed).toEqual(['#AABBCC']);
  });

  it('extracts fonts into libraryFallback', () => {
    const b = mockBridge();
    extractDesignDecisions(b, { fontFamily: 'Roboto' }, 'libraryFallback');
    expect(b._lfd?.fontsUsed).toEqual(['Roboto']);
  });
});

describe('migrationContext', () => {
  it('saves and consumes design decisions', () => {
    const b = mockBridge();
    extractDesignDecisions(b, { fill: '#FF0000', fontFamily: 'Inter', cornerRadius: 8 });
    b.saveMigrationContext();
    const ctx = b.consumeMigrationContext();
    expect(ctx).not.toBeNull();
    expect(ctx?.fillsUsed).toEqual(['#FF0000']);
    expect(ctx?.fontsUsed).toEqual(['Inter']);
    expect(ctx?.radiusValues).toEqual([8]);
  });

  it('consume clears the context', () => {
    const b = mockBridge();
    extractDesignDecisions(b, { fill: '#FF0000' });
    b.saveMigrationContext();
    b.consumeMigrationContext();
    expect(b.consumeMigrationContext()).toBeNull();
  });

  it('returns null when no decisions to migrate', () => {
    const b = mockBridge();
    b.saveMigrationContext();
    expect(b.consumeMigrationContext()).toBeNull();
  });
});
