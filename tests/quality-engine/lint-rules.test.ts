/**
 * Tests for lint rules — pure logic, no Figma API dependency.
 */

import { describe, expect, it } from 'vitest';
import { emptyContainerRule } from '../../packages/quality-engine/src/rules/layout/empty-container.js';
import { defaultNameRule } from '../../packages/quality-engine/src/rules/naming/default-name.js';
import { noTextStyleRule } from '../../packages/quality-engine/src/rules/spec/no-text-style.js';
import { componentBindingsRule } from '../../packages/quality-engine/src/rules/structure/component-bindings.js';
import { wcagTextSizeRule } from '../../packages/quality-engine/src/rules/wcag/wcag-text-size.js';
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

// ─── default-name ───

describe('default-name', () => {
  it('flags "Frame 1"', () => {
    const v = defaultNameRule.check(makeNode({ name: 'Frame 1', type: 'FRAME' }), emptyCtx);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('default-name');
  });

  it('flags "Rectangle 2"', () => {
    const v = defaultNameRule.check(makeNode({ name: 'Rectangle 2', type: 'RECTANGLE' }), emptyCtx);
    expect(v).toHaveLength(1);
  });

  it('passes custom name', () => {
    const v = defaultNameRule.check(makeNode({ name: 'Header Card', type: 'FRAME' }), emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('flags bare type name without number', () => {
    const v = defaultNameRule.check(makeNode({ name: 'Frame', type: 'FRAME' }), emptyCtx);
    expect(v).toHaveLength(1);
  });
});

// ─── empty-container ───

describe('empty-container', () => {
  it('flags empty frame', () => {
    const v = emptyContainerRule.check(makeNode({ type: 'FRAME', children: [] }), emptyCtx);
    expect(v).toHaveLength(1);
  });

  it('passes frame with children', () => {
    const child = makeNode({ id: '2:1', name: 'Child', type: 'TEXT', characters: 'Hello' });
    const v = emptyContainerRule.check(makeNode({ type: 'FRAME', children: [child] }), emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('ignores non-container types', () => {
    const v = emptyContainerRule.check(makeNode({ type: 'RECTANGLE' }), emptyCtx);
    expect(v).toHaveLength(0);
  });
});

// ─── wcag-text-size ───

describe('wcag-text-size', () => {
  it('flags text smaller than desktop minimum (12px) by default', () => {
    // No platform context → defaults to desktop 12px threshold
    const v = wcagTextSizeRule.check(makeNode({ type: 'TEXT', fontSize: 10 }), emptyCtx);
    expect(v).toHaveLength(1);
    expect(v[0].autoFixable).toBe(true);
    expect(v[0].fixData?.fontSize).toBe(12);
  });

  it('passes 12px text on desktop', () => {
    const v = wcagTextSizeRule.check(makeNode({ type: 'TEXT', fontSize: 12 }), emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('passes 16px text', () => {
    const v = wcagTextSizeRule.check(makeNode({ type: 'TEXT', fontSize: 16 }), emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('ignores non-text nodes', () => {
    const v = wcagTextSizeRule.check(makeNode({ type: 'FRAME', fontSize: 8 }), emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('allows 10px text on mobile platform', () => {
    // Mobile threshold is 10px — a 10px text should pass
    const v = wcagTextSizeRule.check(
      makeNode({ type: 'TEXT', fontSize: 10, platform: 'mobile' }),
      emptyCtx,
    );
    expect(v).toHaveLength(0);
  });

  it('flags 9px text on mobile (below 10px minimum)', () => {
    const v = wcagTextSizeRule.check(
      makeNode({ type: 'TEXT', fontSize: 9, platform: 'mobile' }),
      emptyCtx,
    );
    expect(v).toHaveLength(1);
    expect(v[0].fixData?.fontSize).toBe(10);
  });

  it('flags 10px text on desktop (below 12px minimum)', () => {
    const v = wcagTextSizeRule.check(
      makeNode({ type: 'TEXT', fontSize: 10, platform: 'desktop' }),
      emptyCtx,
    );
    expect(v).toHaveLength(1);
    expect(v[0].fixData?.fontSize).toBe(12);
  });

  it('falls back to mobile threshold when parentWidth suggests mobile', () => {
    // No explicit platform but parentWidth <= 500 → treat as mobile
    const v = wcagTextSizeRule.check(
      makeNode({ type: 'TEXT', fontSize: 10, parentWidth: 402 }),
      emptyCtx,
    );
    expect(v).toHaveLength(0);
  });
});

// ─── no-text-style ───

describe('no-text-style', () => {
  it('flags text without textStyleId', () => {
    const v = noTextStyleRule.check(makeNode({ type: 'TEXT', fontSize: 16 }), emptyCtx);
    expect(v).toHaveLength(1);
  });

  it('passes text with textStyleId', () => {
    const v = noTextStyleRule.check(makeNode({ type: 'TEXT', fontSize: 16, textStyleId: 'S:abc' }), emptyCtx);
    expect(v).toHaveLength(0);
  });
});

// ─── component-bindings ───

describe('component-bindings', () => {
  it('flags unused TEXT property', () => {
    const node = makeNode({
      type: 'COMPONENT',
      componentPropertyDefinitions: {
        label: { type: 'TEXT', defaultValue: 'Click' },
      },
      children: [makeNode({ id: '2:1', type: 'TEXT', characters: 'Click' })],
    });
    const v = componentBindingsRule.check(node, emptyCtx);
    expect(v).toHaveLength(1);
    expect(v[0].currentValue).toBe('label');
  });

  it('passes when property is referenced', () => {
    const node = makeNode({
      type: 'COMPONENT',
      componentPropertyDefinitions: {
        label: { type: 'TEXT', defaultValue: 'Click' },
      },
      children: [
        makeNode({
          id: '2:1',
          type: 'TEXT',
          characters: 'Click',
          componentPropertyReferences: { characters: 'label' },
        }),
      ],
    });
    const v = componentBindingsRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('skips VARIANT properties', () => {
    const node = makeNode({
      type: 'COMPONENT',
      componentPropertyDefinitions: {
        Size: { type: 'VARIANT', defaultValue: 'Medium', variantOptions: ['Small', 'Medium', 'Large'] },
      },
      children: [],
    });
    const v = componentBindingsRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('ignores non-COMPONENT nodes', () => {
    const v = componentBindingsRule.check(makeNode({ type: 'FRAME' }), emptyCtx);
    expect(v).toHaveLength(0);
  });
});
