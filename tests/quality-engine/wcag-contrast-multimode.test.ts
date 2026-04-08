/**
 * Tests for wcag-contrast multi-mode (dark mode) contrast checking (N2).
 */

import { describe, expect, it } from 'vitest';
import { wcagContrastRule } from '../../packages/quality-engine/src/rules/wcag/wcag-contrast.js';
import type { AbstractNode, LintContext } from '../../packages/quality-engine/src/types.js';

const emptyCtx: LintContext = {
  colorTokens: new Map(),
  spacingTokens: new Map(),
  radiusTokens: new Map(),
  typographyTokens: new Map(),
  variableIds: new Map(),
};

function makeTextNode(overrides: Partial<AbstractNode>): AbstractNode {
  return {
    id: '1:1',
    name: 'Text',
    type: 'TEXT',
    fontSize: 14,
    fills: [{ type: 'SOLID', color: '#000000', visible: true }],
    ...overrides,
  };
}

describe('wcag-contrast multi-mode checks', () => {
  it('passes when both modes have adequate contrast', () => {
    const node = makeTextNode({
      fills: [{ type: 'SOLID', color: '#000000', visible: true }],
      parentBgColor: '#FFFFFF',
      variableModeColors: { Light: '#000000', Dark: '#FFFFFF' },
      parentBgModeColors: { Light: '#FFFFFF', Dark: '#111111' },
    });
    const v = wcagContrastRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('flags dark mode when contrast fails only in dark mode', () => {
    const node = makeTextNode({
      fills: [{ type: 'SOLID', color: '#000000', visible: true }],
      parentBgColor: '#FFFFFF',
      // Light: black on white = 21:1 (pass)
      // Dark: dark gray on near-black = ~1.5:1 (fail)
      variableModeColors: { Light: '#000000', Dark: '#333333' },
      parentBgModeColors: { Light: '#FFFFFF', Dark: '#222222' },
    });
    const v = wcagContrastRule.check(node, emptyCtx);
    expect(v.length).toBeGreaterThan(0);
    const darkViolation = v.find((x) => x.currentValue?.includes('Dark mode'));
    expect(darkViolation).toBeDefined();
    expect(darkViolation!.suggestion).toContain('Dark mode');
  });

  it('flags light mode when contrast fails only in light mode', () => {
    const node = makeTextNode({
      fills: [{ type: 'SOLID', color: '#FFFFFF', visible: true }],
      parentBgColor: '#000000',
      // Light: light gray on white = ~1.1:1 (fail)
      // Dark: white on black = 21:1 (pass)
      variableModeColors: { Light: '#EEEEEE', Dark: '#FFFFFF' },
      parentBgModeColors: { Light: '#FFFFFF', Dark: '#000000' },
    });
    const v = wcagContrastRule.check(node, emptyCtx);
    const lightViolation = v.find((x) => x.currentValue?.includes('Light mode'));
    expect(lightViolation).toBeDefined();
  });

  it('flags both modes when both fail', () => {
    const node = makeTextNode({
      fills: [{ type: 'SOLID', color: '#CCCCCC', visible: true }],
      parentBgColor: '#DDDDDD',
      variableModeColors: { Light: '#CCCCCC', Dark: '#444444' },
      parentBgModeColors: { Light: '#DDDDDD', Dark: '#555555' },
    });
    const v = wcagContrastRule.check(node, emptyCtx);
    const modeViolations = v.filter((x) => x.currentValue?.includes('mode'));
    expect(modeViolations.length).toBe(2);
  });

  it('skips multi-mode check when variableModeColors is absent', () => {
    const node = makeTextNode({
      fills: [{ type: 'SOLID', color: '#000000', visible: true }],
      parentBgColor: '#FFFFFF',
    });
    const v = wcagContrastRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('skips mode when fg or bg color is missing for that mode', () => {
    const node = makeTextNode({
      fills: [{ type: 'SOLID', color: '#000000', visible: true }],
      parentBgColor: '#FFFFFF',
      variableModeColors: { Light: '#000000' }, // Dark mode fg missing
      parentBgModeColors: { Light: '#FFFFFF', Dark: '#111111' },
    });
    const v = wcagContrastRule.check(node, emptyCtx);
    // Only checks Light mode (pass), skips Dark because fg is missing
    expect(v).toHaveLength(0);
  });

  it('uses large text threshold (3:1) for multi-mode checks', () => {
    const node = makeTextNode({
      fontSize: 24,
      fills: [{ type: 'SOLID', color: '#767676', visible: true }],
      parentBgColor: '#FFFFFF',
      // #767676 on #FFFFFF = 4.54:1 (passes 3:1 for large text)
      variableModeColors: { Light: '#767676', Dark: '#999999' },
      parentBgModeColors: { Light: '#FFFFFF', Dark: '#000000' },
    });
    const v = wcagContrastRule.check(node, emptyCtx);
    // Both should pass at 3:1 threshold
    expect(v).toHaveLength(0);
  });
});
