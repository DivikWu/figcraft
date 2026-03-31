/**
 * Tests for spacer-frame lint rule.
 */

import { describe, it, expect } from 'vitest';
import type { AbstractNode, LintContext } from '../../packages/quality-engine/src/types.js';
import { spacerFrameRule } from '../../packages/quality-engine/src/rules/layout/spacer-frame.js';

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

describe('spacer-frame', () => {
  it('flags empty frame named "Spacer 1"', () => {
    const v = spacerFrameRule.check(makeNode({ name: 'Spacer 1', children: [] }), emptyCtx);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('spacer-frame');
  });

  it('flags empty frame named "Spacer"', () => {
    const v = spacerFrameRule.check(makeNode({ name: 'Spacer', children: [] }), emptyCtx);
    expect(v).toHaveLength(1);
  });

  it('flags "spacer-2" (case insensitive, dash separator)', () => {
    const v = spacerFrameRule.check(makeNode({ name: 'spacer-2', children: [] }), emptyCtx);
    expect(v).toHaveLength(1);
  });

  it('flags "Spacer_3" (underscore separator)', () => {
    const v = spacerFrameRule.check(makeNode({ name: 'Spacer_3', children: [] }), emptyCtx);
    expect(v).toHaveLength(1);
  });

  it('flags thin invisible frame (width ≤ 4px, no fill)', () => {
    const v = spacerFrameRule.check(makeNode({
      name: 'Gap',
      width: 2,
      height: 24,
      children: [],
      fills: [],
    }), emptyCtx);
    expect(v).toHaveLength(1);
  });

  it('flags thin invisible frame (height ≤ 4px, no fill)', () => {
    const v = spacerFrameRule.check(makeNode({
      name: 'Divider Gap',
      width: 300,
      height: 1,
      children: [],
      fills: [{ visible: false, opacity: 0, color: '#000000' }],
    }), emptyCtx);
    expect(v).toHaveLength(1);
  });

  it('passes frame with children', () => {
    const child = makeNode({ id: '2:1', name: 'Child', type: 'TEXT', characters: 'Hi' });
    const v = spacerFrameRule.check(makeNode({ name: 'Spacer 1', children: [child] }), emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('passes normal empty frame (not named spacer, not thin)', () => {
    const v = spacerFrameRule.check(makeNode({
      name: 'Container',
      width: 100,
      height: 100,
      children: [],
      fills: [],
    }), emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('passes non-frame nodes', () => {
    const v = spacerFrameRule.check(makeNode({ type: 'RECTANGLE', name: 'Spacer 1' }), emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('passes frame with visible fill even if thin', () => {
    const v = spacerFrameRule.check(makeNode({
      name: 'Divider',
      width: 300,
      height: 1,
      children: [],
      fills: [{ visible: true, opacity: 1, color: '#CCCCCC' }],
    }), emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('reports autoFixable: true with fixData', () => {
    const v = spacerFrameRule.check(makeNode({
      name: 'Spacer 1',
      width: 100,
      height: 20,
      children: [],
    }), emptyCtx);
    expect(v).toHaveLength(1);
    expect(v[0].autoFixable).toBe(true);
    expect(v[0].fixData).toEqual({
      action: 'remove-spacer',
      width: 100,
      height: 20,
    });
  });
});
