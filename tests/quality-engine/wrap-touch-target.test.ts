/**
 * Tests for wcag-target-size rule.
 *
 * TEXT nodes are explicitly excluded — a glyph is never the click target,
 * the wrapping FRAME/COMPONENT is. Interactive name patterns use word
 * boundaries to avoid matching "Tabs / Light" or plain "Tab" label text.
 */

import { describe, expect, it } from 'vitest';
import { wcagTargetSizeRule } from '../../packages/quality-engine/src/rules/wcag/wcag-target-size.js';
import type { AbstractNode, LintContext } from '../../packages/quality-engine/src/types.js';

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

// ─── TEXT nodes are excluded (glyph is never the click target) ───

describe('wcag-target-size TEXT exclusion', () => {
  it('skips undersized TEXT even if its name looks interactive', () => {
    // The text glyph inside a Tab component — parent container owns the size contract.
    const node = makeNode({ name: 'Tab', type: 'TEXT', width: 15, height: 20 });
    expect(wcagTargetSizeRule.check(node, emptyCtx)).toHaveLength(0);
  });

  it('skips TEXT regardless of interactive-looking name', () => {
    for (const name of ['Button Label', 'Link Text', 'Toggle', 'Checkbox']) {
      const node = makeNode({ name, type: 'TEXT', width: 36, height: 14 });
      expect(wcagTargetSizeRule.check(node, emptyCtx)).toHaveLength(0);
    }
  });

  it('returns resize for non-TEXT undersized interactive FRAME', () => {
    const node = makeNode({ name: 'Icon Button', type: 'FRAME', width: 20, height: 20 });
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
    'Button',
    'Submit Btn',
    'Nav Link',
    'Tab Item',
    'Toggle Switch',
    'Checkbox',
    'Radio Option',
    'Search Input',
    'Icon Button',
    'Clickable Area',
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

// ─── name pattern precision (word boundaries) ───

describe('wcag-target-size name pattern precision', () => {
  it('ignores "Table Row" (Tab is a substring, not a whole word)', () => {
    const node = makeNode({ name: 'Table Row', type: 'FRAME', width: 10, height: 10 });
    expect(wcagTargetSizeRule.check(node, emptyCtx)).toHaveLength(0);
  });

  it('ignores "Untouchables" (touchable as substring, not a whole word)', () => {
    const node = makeNode({ name: 'Untouchables', type: 'FRAME', width: 10, height: 10 });
    expect(wcagTargetSizeRule.check(node, emptyCtx)).toHaveLength(0);
  });
});

// ─── edge cases ───

describe('wcag-target-size edge cases', () => {
  it('passes TEXT node that meets minimum size (TEXT is always exempt now)', () => {
    const node = makeNode({ name: 'Button', type: 'TEXT', width: 44, height: 44 });
    expect(wcagTargetSizeRule.check(node, emptyCtx)).toHaveLength(0);
  });

  it('flags when only height is too small on a FRAME', () => {
    const node = makeNode({ name: 'Toggle', type: 'FRAME', width: 60, height: 16 });
    const violations = wcagTargetSizeRule.check(node, emptyCtx);
    expect(violations).toHaveLength(1);
  });
});
