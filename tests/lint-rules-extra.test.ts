/**
 * Tests for additional lint rules — layout, wcag, token rules.
 */

import { describe, it, expect } from 'vitest';
import type { AbstractNode, LintContext } from '../src/plugin/linter/types.js';
import { fixedInAutolayoutRule } from '../src/plugin/linter/rules/fixed-in-autolayout.js';
import { hardcodedTokenRule } from '../src/plugin/linter/rules/hardcoded-token.js';
import { wcagTargetSizeRule } from '../src/plugin/linter/rules/wcag-target-size.js';
import { wcagLineHeightRule } from '../src/plugin/linter/rules/wcag-line-height.js';
import { maxNestingDepthRule } from '../src/plugin/linter/rules/max-nesting-depth.js';

const emptyCtx: LintContext = {
  colorTokens: new Map(),
  spacingTokens: new Map(),
  radiusTokens: new Map(),
  typographyTokens: new Map(),
  variableIds: new Map(),
};

const libraryCtx: LintContext = {
  ...emptyCtx,
  mode: 'library',
  selectedLibrary: 'TestLib',
};

function makeNode(overrides: Partial<AbstractNode>): AbstractNode {
  return { id: '1:1', name: 'Test', type: 'FRAME', ...overrides };
}

// ─── fixed-in-autolayout ───

describe('fixed-in-autolayout', () => {
  it('flags absolute child in auto layout', () => {
    const node = makeNode({
      type: 'FRAME',
      layoutMode: 'VERTICAL',
      children: [
        makeNode({ id: '2:1', layoutPositioning: 'ABSOLUTE' }),
      ],
    });
    const v = fixedInAutolayoutRule.check(node, emptyCtx);
    expect(v).toHaveLength(1);
  });

  it('passes normal children in auto layout', () => {
    const node = makeNode({
      type: 'FRAME',
      layoutMode: 'VERTICAL',
      children: [makeNode({ id: '2:1' })],
    });
    const v = fixedInAutolayoutRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('ignores non-auto-layout frames', () => {
    const node = makeNode({
      type: 'FRAME',
      children: [makeNode({ id: '2:1', layoutPositioning: 'ABSOLUTE' })],
    });
    const v = fixedInAutolayoutRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });
});

// ─── hardcoded-token ───

describe('hardcoded-token', () => {
  it('flags unbound fill in library mode', () => {
    const node = makeNode({
      type: 'RECTANGLE',
      fills: [{ type: 'SOLID', color: '#FF0000', visible: true }],
    });
    const v = hardcodedTokenRule.check(node, libraryCtx);
    expect(v.length).toBeGreaterThanOrEqual(1);
    expect(v[0].rule).toBe('hardcoded-token');
  });

  it('passes node with bound variables', () => {
    const node = makeNode({
      type: 'RECTANGLE',
      fills: [{ type: 'SOLID', color: '#FF0000', visible: true }],
      boundVariables: { fills: [{ id: 'var:123' }] },
    });
    const v = hardcodedTokenRule.check(node, libraryCtx);
    const fillViolations = v.filter((vi) => String(vi.currentValue).includes('fill'));
    expect(fillViolations).toHaveLength(0);
  });

  it('skips in spec mode', () => {
    const specCtx: LintContext = { ...emptyCtx, mode: 'spec' };
    const node = makeNode({
      type: 'RECTANGLE',
      fills: [{ type: 'SOLID', color: '#FF0000', visible: true }],
    });
    const v = hardcodedTokenRule.check(node, specCtx);
    expect(v).toHaveLength(0);
  });
});

// ─── wcag-target-size ───

describe('wcag-target-size', () => {
  it('flags small button', () => {
    const v = wcagTargetSizeRule.check(
      makeNode({ name: 'Submit Button', type: 'FRAME', width: 30, height: 30 }),
      emptyCtx,
    );
    expect(v).toHaveLength(1);
    expect(v[0].severity).toBe('error');
  });

  it('passes large button', () => {
    const v = wcagTargetSizeRule.check(
      makeNode({ name: 'Submit Button', type: 'FRAME', width: 120, height: 48 }),
      emptyCtx,
    );
    expect(v).toHaveLength(0);
  });

  it('ignores non-interactive elements', () => {
    const v = wcagTargetSizeRule.check(
      makeNode({ name: 'Decorative Frame', type: 'FRAME', width: 10, height: 10 }),
      emptyCtx,
    );
    expect(v).toHaveLength(0);
  });
});

// ─── wcag-line-height ───

describe('wcag-line-height', () => {
  it('flags tight line height', () => {
    const v = wcagLineHeightRule.check(
      makeNode({ type: 'TEXT', fontSize: 16, lineHeight: { unit: 'PIXELS', value: 12 } }),
      emptyCtx,
    );
    expect(v).toHaveLength(1);
  });

  it('passes adequate line height', () => {
    const v = wcagLineHeightRule.check(
      makeNode({ type: 'TEXT', fontSize: 16, lineHeight: { unit: 'PIXELS', value: 24 } }),
      emptyCtx,
    );
    expect(v).toHaveLength(0);
  });

  it('passes AUTO line height', () => {
    const v = wcagLineHeightRule.check(
      makeNode({ type: 'TEXT', fontSize: 16, lineHeight: { unit: 'AUTO' } }),
      emptyCtx,
    );
    expect(v).toHaveLength(0);
  });
});

// ─── max-nesting-depth ───

describe('max-nesting-depth', () => {
  it('flags deeply nested frames', () => {
    let deepest: AbstractNode = makeNode({ id: '9:1', name: 'Deep', type: 'FRAME' });
    for (let i = 8; i >= 2; i--) {
      deepest = makeNode({ id: `${i}:1`, name: `Level ${i}`, type: 'FRAME', children: [deepest] });
    }
    const root = makeNode({ id: '1:1', name: 'Root', type: 'FRAME', children: [deepest] });

    const v = maxNestingDepthRule.check(root, emptyCtx);
    expect(v.length).toBeGreaterThan(0);
    expect(v[0].rule).toBe('max-nesting-depth');
  });

  it('passes shallow nesting', () => {
    const node = makeNode({
      type: 'FRAME',
      children: [
        makeNode({ id: '2:1', type: 'FRAME', children: [
          makeNode({ id: '3:1', type: 'TEXT' }),
        ]}),
      ],
    });
    const v = maxNestingDepthRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('ignores non-container types', () => {
    const v = maxNestingDepthRule.check(makeNode({ type: 'RECTANGLE' }), emptyCtx);
    expect(v).toHaveLength(0);
  });
});
