/**
 * Tests for design decisions extraction (Phase 2).
 */

import { describe, expect, it } from 'vitest';
import type { Bridge, DesignDecisions } from '../../packages/core-mcp/src/bridge.js';
import { extractDesignDecisions } from '../../packages/core-mcp/src/tools/logic/design-decisions.js';

/** Minimal mock bridge with designDecisions support. */
function mockBridge(): Bridge & { _dd: DesignDecisions | null } {
  const bridge = {
    _dd: null as DesignDecisions | null,
    mergeDesignDecisions(partial: Partial<DesignDecisions>) {
      if (!bridge._dd) {
        bridge._dd = { fillsUsed: [], fontsUsed: [], radiusValues: [], spacingValues: [] };
      }
      if (partial.fillsUsed) {
        for (const f of partial.fillsUsed) if (!bridge._dd.fillsUsed.includes(f)) bridge._dd.fillsUsed.push(f);
      }
      if (partial.fontsUsed) {
        for (const f of partial.fontsUsed) if (!bridge._dd.fontsUsed.includes(f)) bridge._dd.fontsUsed.push(f);
      }
      if (partial.radiusValues) {
        for (const v of partial.radiusValues) if (!bridge._dd.radiusValues.includes(v)) bridge._dd.radiusValues.push(v);
      }
      if (partial.spacingValues) {
        for (const v of partial.spacingValues)
          if (!bridge._dd.spacingValues.includes(v)) bridge._dd.spacingValues.push(v);
      }
      if (partial.elevationStyle) bridge._dd.elevationStyle = partial.elevationStyle;
    },
  };
  return bridge as unknown as Bridge & { _dd: DesignDecisions | null };
}

describe('extractDesignDecisions', () => {
  it('extracts fills from root params', () => {
    const b = mockBridge();
    extractDesignDecisions(b, { fill: '#FF0000', name: 'Screen' });
    expect(b._dd?.fillsUsed).toEqual(['#FF0000']);
  });

  it('extracts fonts from root params', () => {
    const b = mockBridge();
    extractDesignDecisions(b, { fontFamily: 'Poppins' });
    expect(b._dd?.fontsUsed).toEqual(['Poppins']);
  });

  it('extracts cornerRadius and spacing', () => {
    const b = mockBridge();
    extractDesignDecisions(b, { cornerRadius: 12, itemSpacing: 16, padding: 24 });
    expect(b._dd?.radiusValues).toEqual([12]);
    expect(b._dd?.spacingValues).toEqual([16, 24]);
  });

  it('extracts from nested children', () => {
    const b = mockBridge();
    extractDesignDecisions(b, {
      fill: '#F9FAFB',
      children: [
        { type: 'frame', fill: '#2665fd', cornerRadius: 8 },
        { type: 'text', fontFamily: 'Inter', fill: '#111827' },
      ],
    });
    expect(b._dd?.fillsUsed).toEqual(['#F9FAFB', '#2665FD', '#111827']);
    expect(b._dd?.fontsUsed).toEqual(['Inter']);
    expect(b._dd?.radiusValues).toEqual([8]);
  });

  it('extracts from batch items', () => {
    const b = mockBridge();
    extractDesignDecisions(b, {
      items: [{ fill: '#FFFFFF' }, { fill: '#000000' }],
    });
    expect(b._dd?.fillsUsed).toEqual(['#FFFFFF', '#000000']);
  });

  it('deduplicates on merge', () => {
    const b = mockBridge();
    extractDesignDecisions(b, { fill: '#FF0000', cornerRadius: 8 });
    extractDesignDecisions(b, { fill: '#FF0000', cornerRadius: 8 });
    expect(b._dd?.fillsUsed).toEqual(['#FF0000']);
    expect(b._dd?.radiusValues).toEqual([8]);
  });

  it('detects elevation style from shadow', () => {
    const b = mockBridge();
    extractDesignDecisions(b, { shadow: { blur: 12 } });
    expect(b._dd?.elevationStyle).toBe('elevated');
  });

  it('detects elevation style from blur', () => {
    const b = mockBridge();
    extractDesignDecisions(b, { blur: 8 });
    expect(b._dd?.elevationStyle).toBe('elevated');
  });

  it('skips invalid hex values', () => {
    const b = mockBridge();
    extractDesignDecisions(b, { fill: 'not-a-hex' });
    expect(b._dd).toBeNull();
  });

  it('does not merge when no data found', () => {
    const b = mockBridge();
    extractDesignDecisions(b, { name: 'Empty', width: 100 });
    expect(b._dd).toBeNull();
  });

  it('extracts strokeColor', () => {
    const b = mockBridge();
    extractDesignDecisions(b, { strokeColor: '#E5E7EB' });
    expect(b._dd?.fillsUsed).toEqual(['#E5E7EB']);
  });

  it('deduplicates case-insensitive hex', () => {
    const b = mockBridge();
    extractDesignDecisions(b, { fill: '#ff0000' });
    extractDesignDecisions(b, { fill: '#FF0000' });
    expect(b._dd?.fillsUsed).toEqual(['#FF0000']);
  });
});
