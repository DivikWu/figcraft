/**
 * Tests for wrap-touch-target strategy.
 *
 * Validates end-to-end from rule detection → fix descriptor → deferred strategy:
 * - TEXT nodes get deferred 'wrap-touch-target' strategy (not direct resize)
 * - Non-TEXT interactive nodes get direct resize
 * - Various interactive name patterns trigger the rule
 * - Fix descriptor data contains correct minWidth/minHeight
 */

import { describe, it, expect } from 'vitest';
import type { AbstractNode, LintContext } from '../../packages/quality-engine/src/types.js';
import { wcagTargetSizeRule } from '../../packages/quality-engine/src/rules/wcag/wcag-target-size.js';

const emptyCtx: LintContext = {
  colorTokens: new Map(),
  spacingTokens: new Map(),
  radiusTokens: new Map(),
  typographyTokens: new Map(),
  variableIds: new Map(),
};

function makeNode(overrides: Partial<AbstractNode>): AbstractNode {
  return { id: '1:1', name: 'Test', type: 'FRAME', ...overrides };
}

// ─── wrap-touch-target triggers on TEXT nodes ───

describe('wrap-touch-target strategy (TEXT node path)', () => {
  it('returns deferred wrap-touch-target for undersized TEXT button', () => {
    const node = makeNode({ name: 'Button Label', type: 'TEXT', width: 36, height: 14 });
    const violations = wcagTargetSizeRule.check(node, emptyCtx);
    expect(violations).toHaveLength(1);
    expect(violations[0].fixData?.nodeType).toBe('TEXT');

    const fix = wcagTargetSizeRule.describeFix!(violations[0]);
    expect(fix).not.toBeNull();
    expect(fix!.kind).toBe('deferred');
    if (fix!.kind === 'deferred') {
      expect(fix!.strategy).toBe('wrap-touch-target');
      expect(fix!.data.minWidth).toBe(44); // max(44, 36) = 44
      expect(fix!.data.minHeight).toBe(44);
    }
  });

  it('uses text width when wider than 44px', () => {
    const node = makeNode({ name: 'Link Text', type: 'TEXT', width: 120, height: 14 });
    const violations = wcagTargetSizeRule.check(node, emptyCtx);
    expect(violations).toHaveLength(1);

    const fix = wcagTargetSizeRule.describeFix!(violations[0]);
    if (fix!.kind === 'deferred') {
      expect(fix!.data.minWidth).toBe(120); // max(44, 120) = 120
      expect(fix!.data.minHeight).toBe(44);
    }
  });

  it('returns resize (not deferred) for non-TEXT undersized button', () => {
    const node = makeNode({ name: 'Icon Button', type: 'FRAME', width: 24, height: 24 });
    const violations = wcagTargetSizeRule.check(node, emptyCtx);
    expect(violations).toHaveLength(1);

    const fix = wcagTargetSizeRule.describeFix!(violations[0]);
    expect(fix).not.toBeNull();
    expect(fix!.kind).toBe('resize');
  });
});

// ─── interactive name pattern coverage ───

describe('wcag-target-size interactive patterns', () => {
  const interactiveNames = [
    'Button', 'Submit Btn', 'Nav Link', 'Tab Item',
    'Toggle Switch', 'Checkbox', 'Radio Option',
    'Search Input', 'Icon Button', 'Clickable Area',
    'Touchable Row',
  ];

  for (const name of interactiveNames) {
    it(`detects "${name}" as interactive`, () => {
      const node = makeNode({ name, width: 20, height: 20 });
      const violations = wcagTargetSizeRule.check(node, emptyCtx);
      expect(violations).toHaveLength(1);
      expect(violations[0].rule).toBe('wcag-target-size');
    });
  }

  it('ignores non-interactive names', () => {
    const nonInteractive = ['Header', 'Card', 'Container', 'Spacer', 'Divider'];
    for (const name of nonInteractive) {
      const node = makeNode({ name, width: 20, height: 20 });
      const violations = wcagTargetSizeRule.check(node, emptyCtx);
      expect(violations).toHaveLength(0);
    }
  });
});

// ─── edge cases ───

describe('wcag-target-size edge cases', () => {
  it('passes TEXT node that meets minimum size', () => {
    const node = makeNode({ name: 'Button', type: 'TEXT', width: 44, height: 44 });
    const violations = wcagTargetSizeRule.check(node, emptyCtx);
    expect(violations).toHaveLength(0);
  });

  it('flags when only height is too small on TEXT', () => {
    const node = makeNode({ name: 'Tab', type: 'TEXT', width: 60, height: 16 });
    const violations = wcagTargetSizeRule.check(node, emptyCtx);
    expect(violations).toHaveLength(1);

    const fix = wcagTargetSizeRule.describeFix!(violations[0]);
    if (fix!.kind === 'deferred') {
      expect(fix!.strategy).toBe('wrap-touch-target');
      expect(fix!.data.minWidth).toBe(60); // preserve text width
      expect(fix!.data.minHeight).toBe(44);
    }
  });

  it('includes nodeType in fixData for strategy dispatch', () => {
    const textNode = makeNode({ name: 'Toggle', type: 'TEXT', width: 30, height: 12 });
    const textV = wcagTargetSizeRule.check(textNode, emptyCtx);
    expect(textV[0].fixData?.nodeType).toBe('TEXT');

    const frameNode = makeNode({ name: 'Toggle', type: 'FRAME', width: 30, height: 12 });
    const frameV = wcagTargetSizeRule.check(frameNode, emptyCtx);
    expect(frameV[0].fixData?.nodeType).toBe('FRAME');
  });
});
