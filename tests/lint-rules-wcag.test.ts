/**
 * Tests for WCAG lint rules: contrast (AA).
 */

import { describe, it, expect } from 'vitest';
import type { AbstractNode, LintContext } from '../src/plugin/linter/types.js';
import { wcagContrastRule } from '../src/plugin/linter/rules/wcag-contrast.js';

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
