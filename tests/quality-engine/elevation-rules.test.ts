/**
 * Tests for elevation lint rules (Phase 4).
 */

import { describe, expect, it } from 'vitest';
import { elevationConsistencyRule } from '../../packages/quality-engine/src/rules/layout/elevation-consistency.js';
import { elevationHierarchyRule } from '../../packages/quality-engine/src/rules/layout/elevation-hierarchy.js';
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

const shadowEffect = (radius = 12) => ({
  type: 'DROP_SHADOW' as const,
  visible: true,
  radius,
  offset: { x: 0, y: 4 },
  color: '#00000040',
});

// ─── elevation-consistency ───

describe('elevation-consistency', () => {
  it('flags container with mixed shadow/flat children', () => {
    const node = makeNode({
      layoutMode: 'HORIZONTAL',
      children: [
        makeNode({ id: '2:1', name: 'Card 1', effects: [shadowEffect()] }),
        makeNode({ id: '2:2', name: 'Card 2', effects: [] }),
        makeNode({ id: '2:3', name: 'Card 3', effects: [shadowEffect()] }),
      ],
    });
    const v = elevationConsistencyRule.check(node, emptyCtx);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('elevation-consistency');
    expect(v[0].severity).toBe('heuristic');
    expect(v[0].currentValue).toContain('2 with shadow');
  });

  it('passes when all children have shadows', () => {
    const node = makeNode({
      layoutMode: 'VERTICAL',
      children: [
        makeNode({ id: '2:1', name: 'Card 1', effects: [shadowEffect()] }),
        makeNode({ id: '2:2', name: 'Card 2', effects: [shadowEffect()] }),
      ],
    });
    expect(elevationConsistencyRule.check(node, emptyCtx)).toHaveLength(0);
  });

  it('passes when no children have shadows', () => {
    const node = makeNode({
      layoutMode: 'VERTICAL',
      children: [makeNode({ id: '2:1', name: 'Card 1', effects: [] }), makeNode({ id: '2:2', name: 'Card 2' })],
    });
    expect(elevationConsistencyRule.check(node, emptyCtx)).toHaveLength(0);
  });

  it('skips non-autolayout containers', () => {
    const node = makeNode({
      children: [
        makeNode({ id: '2:1', name: 'Card 1', effects: [shadowEffect()] }),
        makeNode({ id: '2:2', name: 'Card 2', effects: [] }),
      ],
    });
    expect(elevationConsistencyRule.check(node, emptyCtx)).toHaveLength(0);
  });

  it('skips children with effectStyleId (intentional binding)', () => {
    const node = makeNode({
      layoutMode: 'HORIZONTAL',
      children: [
        makeNode({ id: '2:1', name: 'Card 1', effects: [shadowEffect()], effectStyleId: 'S:abc' }),
        makeNode({ id: '2:2', name: 'Card 2', effects: [] }),
      ],
    });
    // Both filtered out since meaningful count < 2 after removing effectStyleId nodes
    expect(elevationConsistencyRule.check(node, emptyCtx)).toHaveLength(0);
  });

  it('ignores non-frame children (TEXT, VECTOR)', () => {
    const node = makeNode({
      layoutMode: 'VERTICAL',
      children: [
        makeNode({ id: '2:1', name: 'Card 1', effects: [shadowEffect()] }),
        { id: '2:2', name: 'Label', type: 'TEXT' } as AbstractNode,
      ],
    });
    expect(elevationConsistencyRule.check(node, emptyCtx)).toHaveLength(0);
  });

  it('considers invisible shadows as flat', () => {
    const node = makeNode({
      layoutMode: 'HORIZONTAL',
      children: [
        makeNode({
          id: '2:1',
          name: 'Card 1',
          effects: [{ type: 'DROP_SHADOW', visible: false, radius: 12 }],
        }),
        makeNode({ id: '2:2', name: 'Card 2', effects: [] }),
      ],
    });
    expect(elevationConsistencyRule.check(node, emptyCtx)).toHaveLength(0);
  });
});

// ─── elevation-hierarchy ───

describe('elevation-hierarchy', () => {
  it('flags child with stronger shadow than parent', () => {
    const node = makeNode({
      effects: [shadowEffect(8)],
      children: [makeNode({ id: '2:1', name: 'Inner Card', effects: [shadowEffect(24)] })],
    });
    const v = elevationHierarchyRule.check(node, emptyCtx);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('elevation-hierarchy');
    expect(v[0].currentValue).toContain('24px');
    expect(v[0].currentValue).toContain('parent: 8px');
  });

  it('passes when child shadow is weaker', () => {
    const node = makeNode({
      effects: [shadowEffect(24)],
      children: [makeNode({ id: '2:1', name: 'Inner Card', effects: [shadowEffect(8)] })],
    });
    expect(elevationHierarchyRule.check(node, emptyCtx)).toHaveLength(0);
  });

  it('passes when child has equal shadow', () => {
    const node = makeNode({
      effects: [shadowEffect(12)],
      children: [makeNode({ id: '2:1', name: 'Inner Card', effects: [shadowEffect(12)] })],
    });
    expect(elevationHierarchyRule.check(node, emptyCtx)).toHaveLength(0);
  });

  it('skips when parent has no shadow', () => {
    const node = makeNode({
      effects: [],
      children: [makeNode({ id: '2:1', name: 'Card', effects: [shadowEffect(12)] })],
    });
    expect(elevationHierarchyRule.check(node, emptyCtx)).toHaveLength(0);
  });

  it('skips non-frame children', () => {
    const node = makeNode({
      effects: [shadowEffect(8)],
      children: [{ id: '2:1', name: 'Text', type: 'TEXT' } as AbstractNode],
    });
    expect(elevationHierarchyRule.check(node, emptyCtx)).toHaveLength(0);
  });

  it('flags multiple violating children', () => {
    const node = makeNode({
      effects: [shadowEffect(4)],
      children: [
        makeNode({ id: '2:1', name: 'Card A', effects: [shadowEffect(12)] }),
        makeNode({ id: '2:2', name: 'Card B', effects: [shadowEffect(20)] }),
        makeNode({ id: '2:3', name: 'Card C', effects: [shadowEffect(2)] }),
      ],
    });
    const v = elevationHierarchyRule.check(node, emptyCtx);
    expect(v).toHaveLength(2);
    expect(v.map((x) => x.nodeName)).toEqual(['Card A', 'Card B']);
  });
});
