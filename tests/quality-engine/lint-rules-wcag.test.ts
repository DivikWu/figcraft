/**
 * Tests for WCAG lint rules: contrast, target-size, text-size, line-height.
 */

import { describe, it, expect } from 'vitest';
import type { AbstractNode, LintContext } from '../../packages/quality-engine/src/types.js';
import { wcagContrastRule } from '../../packages/quality-engine/src/rules/wcag/wcag-contrast.js';
import { wcagTargetSizeRule } from '../../packages/quality-engine/src/rules/wcag/wcag-target-size.js';
import { wcagTextSizeRule } from '../../packages/quality-engine/src/rules/wcag/wcag-text-size.js';
import { wcagLineHeightRule } from '../../packages/quality-engine/src/rules/wcag/wcag-line-height.js';
import { wcagNonTextContrastRule } from '../../packages/quality-engine/src/rules/wcag/wcag-non-text-contrast.js';

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

// ─── severity calibration ───

describe('wcag severity calibration', () => {
  it('wcag-contrast has unsafe severity', () => {
    expect(wcagContrastRule.severity).toBe('unsafe');
  });
  it('wcag-target-size has heuristic severity', () => {
    expect(wcagTargetSizeRule.severity).toBe('heuristic');
  });
  it('wcag-text-size has heuristic severity', () => {
    expect(wcagTextSizeRule.severity).toBe('heuristic');
  });
  it('wcag-line-height has heuristic severity', () => {
    expect(wcagLineHeightRule.severity).toBe('heuristic');
  });
  it('wcag-non-text-contrast has heuristic severity', () => {
    expect(wcagNonTextContrastRule.severity).toBe('heuristic');
  });
});

// ─── preventionHint ───

describe('wcag preventionHint', () => {
  it('wcag-contrast has preventionHint', () => {
    expect(wcagContrastRule.ai?.preventionHint).toBeDefined();
  });
  it('wcag-target-size has preventionHint', () => {
    expect(wcagTargetSizeRule.ai?.preventionHint).toBeDefined();
  });
  it('wcag-text-size has preventionHint', () => {
    expect(wcagTextSizeRule.ai?.preventionHint).toBeDefined();
  });
  it('wcag-line-height has preventionHint', () => {
    expect(wcagLineHeightRule.ai?.preventionHint).toBeDefined();
  });
  it('wcag-non-text-contrast has preventionHint', () => {
    expect(wcagNonTextContrastRule.ai?.preventionHint).toBeDefined();
  });
});

// ─── wcag-target-size describeFix ───

describe('wcag-target-size describeFix', () => {
  it('returns resize descriptor for undersized button', () => {
    const node = makeNode({ name: 'Button', width: 30, height: 30 });
    const violations = wcagTargetSizeRule.check(node, emptyCtx);
    expect(violations).toHaveLength(1);
    expect(violations[0].autoFixable).toBe(true);
    const fix = wcagTargetSizeRule.describeFix!(violations[0]);
    expect(fix).not.toBeNull();
    expect(fix!.kind).toBe('resize');
    if (fix!.kind === 'resize') {
      expect(fix!.width).toBe(44);
      expect(fix!.height).toBe(44);
    }
  });

  it('only resizes the axis that is too small', () => {
    const node = makeNode({ name: 'Button', width: 100, height: 30 });
    const violations = wcagTargetSizeRule.check(node, emptyCtx);
    expect(violations).toHaveLength(1);
    const fix = wcagTargetSizeRule.describeFix!(violations[0]);
    expect(fix).not.toBeNull();
    if (fix!.kind === 'resize') {
      expect(fix!.width).toBeUndefined();
      expect(fix!.height).toBe(44);
    }
  });

  it('skips sufficiently large interactive elements', () => {
    const node = makeNode({ name: 'Button', width: 100, height: 50 });
    const violations = wcagTargetSizeRule.check(node, emptyCtx);
    expect(violations).toHaveLength(0);
  });
});

// ─── wcag-contrast (AA) ───

describe('wcag-contrast', () => {
  it('passes high contrast text (black)', () => {
    const node = makeNode({
      type: 'TEXT', fontSize: 14,
      fills: [{ type: 'SOLID', color: '#000000', visible: true }],
    });
    const v = wcagContrastRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('passes white text (good contrast on black)', () => {
    const node = makeNode({
      type: 'TEXT', fontSize: 14,
      fills: [{ type: 'SOLID', color: '#ffffff', visible: true }],
    });
    const v = wcagContrastRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('uses 3:1 threshold for large text', () => {
    const node = makeNode({
      type: 'TEXT', fontSize: 24,
      fills: [{ type: 'SOLID', color: '#767676', visible: true }],
    });
    const v = wcagContrastRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('skips non-text nodes', () => {
    const v = wcagContrastRule.check(makeNode({ type: 'RECTANGLE' }), emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('skips text without fills', () => {
    const node = makeNode({ type: 'TEXT', fontSize: 14 });
    const v = wcagContrastRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('skips invisible fills', () => {
    const node = makeNode({
      type: 'TEXT', fontSize: 14,
      fills: [{ type: 'SOLID', color: '#cccccc', visible: false }],
    });
    const v = wcagContrastRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });
});

// ─── wcag-non-text-contrast (WCAG 1.4.11) ───

describe('wcag-non-text-contrast', () => {
  it('flags low-contrast stroke on rectangle', () => {
    const node = makeNode({
      type: 'RECTANGLE', width: 100, height: 40,
      strokes: [{ type: 'SOLID', color: '#e0e0e0', visible: true }],
      strokeWeight: 1,
      parentBgColor: '#ffffff',
    });
    const v = wcagNonTextContrastRule.check(node, emptyCtx);
    expect(v.length).toBeGreaterThan(0);
    expect(v[0].rule).toBe('wcag-non-text-contrast');
    expect(v[0].currentValue).toContain('stroke');
  });

  it('passes adequate stroke contrast', () => {
    const node = makeNode({
      type: 'RECTANGLE', width: 100, height: 40,
      strokes: [{ type: 'SOLID', color: '#333333', visible: true }],
      strokeWeight: 1,
      parentBgColor: '#ffffff',
    });
    const v = wcagNonTextContrastRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('flags low-contrast fill on small element (icon-sized)', () => {
    const node = makeNode({
      type: 'ELLIPSE', width: 24, height: 24,
      fills: [{ type: 'SOLID', color: '#cccccc', visible: true }],
      parentBgColor: '#ffffff',
    });
    const v = wcagNonTextContrastRule.check(node, emptyCtx);
    expect(v.length).toBeGreaterThan(0);
    expect(v[0].currentValue).toContain('fill');
  });

  it('skips fill check on large containers (> 200px)', () => {
    const node = makeNode({
      type: 'FRAME', width: 400, height: 300,
      fills: [{ type: 'SOLID', color: '#f5f5f5', visible: true }],
      parentBgColor: '#ffffff',
    });
    const v = wcagNonTextContrastRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('skips TEXT nodes (handled by wcag-contrast)', () => {
    const node = makeNode({
      type: 'TEXT', fontSize: 14,
      fills: [{ type: 'SOLID', color: '#cccccc', visible: true }],
      parentBgColor: '#ffffff',
    });
    const v = wcagNonTextContrastRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('returns empty when no parentBgColor', () => {
    const node = makeNode({
      type: 'RECTANGLE', width: 50, height: 50,
      strokes: [{ type: 'SOLID', color: '#e0e0e0', visible: true }],
      strokeWeight: 1,
    });
    const v = wcagNonTextContrastRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('checks both stroke and fill on small nodes', () => {
    const node = makeNode({
      type: 'RECTANGLE', width: 100, height: 40,
      strokes: [{ type: 'SOLID', color: '#e0e0e0', visible: true }],
      strokeWeight: 1,
      fills: [{ type: 'SOLID', color: '#eeeeee', visible: true }],
      parentBgColor: '#ffffff',
    });
    const v = wcagNonTextContrastRule.check(node, emptyCtx);
    // Should flag both stroke and fill
    expect(v.length).toBe(2);
  });
});
