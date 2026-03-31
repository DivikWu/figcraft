/**
 * Tests for layout lint rules: overflow-parent, unbounded-hug, no-autolayout.
 */

import { describe, it, expect } from 'vitest';
import type { AbstractNode, LintContext } from '../../packages/quality-engine/src/types.js';
import { overflowParentRule } from '../../packages/quality-engine/src/rules/layout/overflow-parent.js';
import { unboundedHugRule } from '../../packages/quality-engine/src/rules/layout/unbounded-hug.js';
import { noAutolayoutRule } from '../../packages/quality-engine/src/rules/layout/no-autolayout.js';

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

// ─── overflow-parent ───

describe('overflow-parent', () => {
  it('flags child wider than parent inner width in VERTICAL layout', () => {
    const node = makeNode({
      layoutMode: 'VERTICAL',
      width: 350,
      paddingLeft: 20,
      paddingRight: 20,
      children: [
        makeNode({ id: '2:1', name: 'Wide Child', width: 400, height: 50 }),
      ],
    });
    const v = overflowParentRule.check(node, emptyCtx);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('overflow-parent');
    expect(v[0].autoFixable).toBe(true);
    expect(v[0].fixData?.layoutAlign).toBe('STRETCH');
  });

  it('flags child taller than parent inner height in HORIZONTAL layout', () => {
    const node = makeNode({
      layoutMode: 'HORIZONTAL',
      height: 100,
      paddingTop: 10,
      paddingBottom: 10,
      children: [
        makeNode({ id: '2:1', name: 'Tall Child', width: 50, height: 120 }),
      ],
    });
    const v = overflowParentRule.check(node, emptyCtx);
    expect(v).toHaveLength(1);
    expect(v[0].suggestion).toContain('vertically');
  });

  it('passes child within parent bounds', () => {
    const node = makeNode({
      layoutMode: 'VERTICAL',
      width: 350,
      paddingLeft: 20,
      paddingRight: 20,
      children: [
        makeNode({ id: '2:1', name: 'Good Child', width: 300, height: 50 }),
      ],
    });
    const v = overflowParentRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('ignores non-auto-layout frames', () => {
    const node = makeNode({
      width: 350,
      children: [
        makeNode({ id: '2:1', name: 'Wide Child', width: 500, height: 50 }),
      ],
    });
    const v = overflowParentRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('ignores absolute-positioned children', () => {
    const node = makeNode({
      layoutMode: 'VERTICAL',
      width: 350,
      children: [
        makeNode({ id: '2:1', name: 'Absolute', width: 500, height: 50, layoutPositioning: 'ABSOLUTE' }),
      ],
    });
    const v = overflowParentRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('allows 1px tolerance for rounding', () => {
    const node = makeNode({
      layoutMode: 'VERTICAL',
      width: 350,
      children: [
        makeNode({ id: '2:1', name: 'Edge', width: 351, height: 50 }),
      ],
    });
    const v = overflowParentRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('accounts for padding in inner width calculation', () => {
    const node = makeNode({
      layoutMode: 'VERTICAL',
      width: 400,
      paddingLeft: 40,
      paddingRight: 40,
      children: [
        makeNode({ id: '2:1', name: 'Child', width: 330, height: 50 }),
      ],
    });
    const v = overflowParentRule.check(node, emptyCtx);
    // Inner width = 400 - 40 - 40 = 320, child is 330 > 321
    expect(v).toHaveLength(1);
  });
});

// ─── unbounded-hug ───

describe('unbounded-hug', () => {
  it('flags HUG cross-axis with STRETCH children', () => {
    const node = makeNode({
      layoutMode: 'VERTICAL',
      // No explicit width → HUG on horizontal (cross-axis)
      height: 500,
      children: [
        makeNode({ id: '2:1', name: 'Stretch Child', layoutAlign: 'STRETCH' } as any),
      ],
    });
    const v = unboundedHugRule.check(node, emptyCtx);
    expect(v.some(vi => vi.currentValue?.toString().includes('STRETCH'))).toBe(true);
    expect(v.some(vi => vi.autoFixable)).toBe(true);
  });

  it('passes when cross-axis has explicit dimension', () => {
    const node = makeNode({
      layoutMode: 'VERTICAL',
      width: 350,
      height: 500,
      children: [
        makeNode({ id: '2:1', name: 'Stretch Child', layoutAlign: 'STRETCH' } as any),
      ],
    });
    const v = unboundedHugRule.check(node, emptyCtx);
    const stretchViolations = v.filter(vi => vi.currentValue?.toString().includes('STRETCH'));
    expect(stretchViolations).toHaveLength(0);
  });

  it('flags HUG/HUG with children as style', () => {
    const node = makeNode({
      name: 'Card',
      layoutMode: 'VERTICAL',
      // No width, no height → HUG/HUG
      children: [
        makeNode({ id: '2:1', name: 'Text', type: 'TEXT' }),
      ],
    });
    const v = unboundedHugRule.check(node, emptyCtx);
    const hugHug = v.filter(vi => vi.severity === 'style');
    expect(hugHug).toHaveLength(1);
    expect(hugHug[0].currentValue).toContain('both axes');
  });

  it('skips root-like frames for HUG/HUG check', () => {
    const node = makeNode({
      name: 'Screen Login',
      layoutMode: 'VERTICAL',
      children: [
        makeNode({ id: '2:1', name: 'Content', type: 'FRAME' }),
      ],
    });
    const v = unboundedHugRule.check(node, emptyCtx);
    const hugHug = v.filter(vi => vi.severity === 'style');
    expect(hugHug).toHaveLength(0);
  });

  it('ignores non-auto-layout frames', () => {
    const node = makeNode({
      children: [
        makeNode({ id: '2:1', name: 'Child' }),
      ],
    });
    const v = unboundedHugRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('ignores frames without children', () => {
    const node = makeNode({
      layoutMode: 'VERTICAL',
    });
    const v = unboundedHugRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });
});

// ─── no-autolayout ───

describe('no-autolayout', () => {
  it('flags frame with 2+ children and no auto-layout', () => {
    const node = makeNode({
      name: 'Card',
      width: 300,
      height: 200,
      children: [
        makeNode({ id: '2:1', name: 'Title', type: 'TEXT', x: 20, y: 20 }),
        makeNode({ id: '2:2', name: 'Body', type: 'TEXT', x: 20, y: 60 }),
      ],
    });
    const v = noAutolayoutRule.check(node, emptyCtx);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('no-autolayout');
    expect(v[0].autoFixable).toBe(true);
    // Children are stacked vertically → should infer VERTICAL
    expect(v[0].fixData?.layoutMode).toBe('VERTICAL');
  });

  it('infers HORIZONTAL direction for side-by-side children', () => {
    const node = makeNode({
      name: 'Row',
      width: 400,
      height: 50,
      children: [
        makeNode({ id: '2:1', name: 'Left', x: 0, y: 0 }),
        makeNode({ id: '2:2', name: 'Right', x: 200, y: 0 }),
      ],
    });
    const v = noAutolayoutRule.check(node, emptyCtx);
    expect(v).toHaveLength(1);
    expect(v[0].fixData?.layoutMode).toBe('HORIZONTAL');
  });

  it('passes frame with auto-layout', () => {
    const node = makeNode({
      layoutMode: 'VERTICAL',
      children: [
        makeNode({ id: '2:1', name: 'A' }),
        makeNode({ id: '2:2', name: 'B' }),
      ],
    });
    const v = noAutolayoutRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('passes frame with single child', () => {
    const node = makeNode({
      children: [
        makeNode({ id: '2:1', name: 'Only' }),
      ],
    });
    const v = noAutolayoutRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('passes frame with no children', () => {
    const node = makeNode({});
    const v = noAutolayoutRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('ignores non-FRAME types', () => {
    const node = makeNode({
      type: 'COMPONENT',
      children: [
        makeNode({ id: '2:1', name: 'A' }),
        makeNode({ id: '2:2', name: 'B' }),
      ],
    });
    const v = noAutolayoutRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('ignores very small frames (likely icons)', () => {
    const node = makeNode({
      width: 20,
      height: 20,
      children: [
        makeNode({ id: '2:1', name: 'Path1', type: 'VECTOR' }),
        makeNode({ id: '2:2', name: 'Path2', type: 'VECTOR' }),
      ],
    });
    const v = noAutolayoutRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });
});
