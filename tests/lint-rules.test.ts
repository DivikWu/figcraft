/**
 * Tests for lint rules — pure logic, no Figma API dependency.
 */

import { describe, it, expect } from 'vitest';
import type { AbstractNode, LintContext } from '../src/plugin/linter/types.js';
import { defaultNameRule } from '../src/plugin/linter/rules/default-name.js';
import { emptyContainerRule } from '../src/plugin/linter/rules/empty-container.js';
import { wcagTextSizeRule } from '../src/plugin/linter/rules/wcag-text-size.js';
import { staleTextNameRule } from '../src/plugin/linter/rules/stale-text-name.js';
import { noTextStyleRule } from '../src/plugin/linter/rules/no-text-style.js';
import { componentBindingsRule } from '../src/plugin/linter/rules/component-bindings.js';
import { noTextPropertyRule } from '../src/plugin/linter/rules/no-text-property.js';

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
  it('flags text smaller than 12px', () => {
    const v = wcagTextSizeRule.check(makeNode({ type: 'TEXT', fontSize: 10 }), emptyCtx);
    expect(v).toHaveLength(1);
    expect(v[0].autoFixable).toBe(true);
    expect(v[0].fixData?.fontSize).toBe(12);
  });

  it('passes 12px text', () => {
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
});

// ─── stale-text-name ───

describe('stale-text-name', () => {
  it('flags text whose name differs from content', () => {
    const v = staleTextNameRule.check(
      makeNode({ type: 'TEXT', name: 'Old Label', characters: 'New Label' }),
      emptyCtx,
    );
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('stale-text-name');
  });

  it('passes when name matches content', () => {
    const v = staleTextNameRule.check(
      makeNode({ type: 'TEXT', name: 'Hello', characters: 'Hello' }),
      emptyCtx,
    );
    expect(v).toHaveLength(0);
  });

  it('ignores non-text nodes', () => {
    const v = staleTextNameRule.check(makeNode({ type: 'FRAME' }), emptyCtx);
    expect(v).toHaveLength(0);
  });
});

// ─── no-text-style ───

describe('no-text-style', () => {
  it('flags text without textStyleId', () => {
    const v = noTextStyleRule.check(
      makeNode({ type: 'TEXT', fontSize: 16 }),
      emptyCtx,
    );
    expect(v).toHaveLength(1);
  });

  it('passes text with textStyleId', () => {
    const v = noTextStyleRule.check(
      makeNode({ type: 'TEXT', fontSize: 16, textStyleId: 'S:abc' }),
      emptyCtx,
    );
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

// ─── no-text-property ───

describe('no-text-property', () => {
  it('flags unexposed text when component has other TEXT props', () => {
    const node = makeNode({
      type: 'COMPONENT',
      componentPropertyDefinitions: {
        title: { type: 'TEXT', defaultValue: 'Title' },
      },
      children: [
        makeNode({
          id: '2:1', type: 'TEXT', name: 'Title', characters: 'Title',
          componentPropertyReferences: { characters: 'title' },
        }),
        makeNode({
          id: '2:2', type: 'TEXT', name: 'Subtitle', characters: 'Sub',
        }),
      ],
    });
    const v = noTextPropertyRule.check(node, emptyCtx);
    expect(v).toHaveLength(1);
    expect(v[0].nodeName).toBe('Subtitle');
  });

  it('skips single-text component with no TEXT props', () => {
    const node = makeNode({
      type: 'COMPONENT',
      componentPropertyDefinitions: {},
      children: [
        makeNode({ id: '2:1', type: 'TEXT', name: 'Label', characters: 'OK' }),
      ],
    });
    const v = noTextPropertyRule.check(node, emptyCtx);
    expect(v).toHaveLength(0);
  });

  it('ignores non-COMPONENT nodes', () => {
    const v = noTextPropertyRule.check(makeNode({ type: 'FRAME' }), emptyCtx);
    expect(v).toHaveLength(0);
  });
});
