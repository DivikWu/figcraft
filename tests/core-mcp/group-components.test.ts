/**
 * Tests for groupComponentsBySet — groups REST API components into component sets + standalone.
 */

import { describe, expect, it } from 'vitest';
import {
  type FigmaComponentMeta,
  type FigmaComponentSetMeta,
  groupComponentsBySet,
} from '../../packages/core-mcp/src/figma-api.js';

function makeComponent(overrides: Partial<FigmaComponentMeta>): FigmaComponentMeta {
  return {
    key: 'comp-key-1',
    name: 'State=Default',
    description: '',
    containing_frame: null,
    ...overrides,
  };
}

function makeComponentSet(overrides: Partial<FigmaComponentSetMeta>): FigmaComponentSetMeta {
  return {
    key: 'set-key-1',
    name: 'Input Field',
    description: '',
    node_id: '100:1',
    containing_frame: null,
    ...overrides,
  };
}

describe('groupComponentsBySet', () => {
  it('groups components into their component set by containingComponentSet.nodeId', () => {
    const sets = [makeComponentSet({ node_id: '100:1', name: 'Input Field' })];
    const components = [
      makeComponent({
        key: 'c1',
        name: 'State=Default',
        containing_frame: {
          name: 'Text field / Mobile',
          containingComponentSet: { nodeId: '100:1', name: 'Input Field' },
        },
      }),
      makeComponent({
        key: 'c2',
        name: 'State=Focused',
        containing_frame: {
          name: 'Text field / Mobile',
          containingComponentSet: { nodeId: '100:1', name: 'Input Field' },
        },
      }),
    ];

    const result = groupComponentsBySet(components, sets);

    expect(result.componentSets).toHaveLength(1);
    expect(result.componentSets[0].name).toBe('Input Field');
    expect(result.componentSets[0].variants).toHaveLength(2);
    expect(result.componentSets[0].variants[0].key).toBe('c1');
    expect(result.componentSets[0].variants[1].key).toBe('c2');
    expect(result.standalone).toHaveLength(0);
  });

  it('puts components without containingComponentSet into standalone', () => {
    const sets = [makeComponentSet({ node_id: '100:1' })];
    const components = [
      makeComponent({
        key: 'c1',
        containing_frame: { name: 'Navbar', containingComponentSet: null },
      }),
      makeComponent({
        key: 'c2',
        containing_frame: null,
      }),
    ];

    const result = groupComponentsBySet(components, sets);

    expect(result.componentSets).toHaveLength(0); // set has 0 variants → filtered out
    expect(result.standalone).toHaveLength(2);
  });

  it('handles mix of grouped and standalone components', () => {
    const sets = [makeComponentSet({ node_id: '100:1', name: 'Button' })];
    const components = [
      makeComponent({
        key: 'c1',
        name: 'Type=Primary',
        containing_frame: { name: 'Mobile', containingComponentSet: { nodeId: '100:1', name: 'Button' } },
      }),
      makeComponent({
        key: 'c2',
        name: 'Logo',
        containing_frame: { name: 'Navbar' },
      }),
    ];

    const result = groupComponentsBySet(components, sets);

    expect(result.componentSets).toHaveLength(1);
    expect(result.componentSets[0].variants).toHaveLength(1);
    expect(result.standalone).toHaveLength(1);
    expect(result.standalone[0].key).toBe('c2');
  });

  it('filters out component sets with zero matched variants', () => {
    const sets = [
      makeComponentSet({ node_id: '100:1', name: 'Has Variants' }),
      makeComponentSet({ node_id: '200:1', name: 'Empty Set' }),
    ];
    const components = [
      makeComponent({
        key: 'c1',
        containing_frame: { name: 'Forms', containingComponentSet: { nodeId: '100:1', name: 'Has Variants' } },
      }),
    ];

    const result = groupComponentsBySet(components, sets);

    expect(result.componentSets).toHaveLength(1);
    expect(result.componentSets[0].name).toBe('Has Variants');
  });

  it('parses variant properties from component name', () => {
    const sets = [makeComponentSet({ node_id: '100:1' })];
    const components = [
      makeComponent({
        key: 'c1',
        name: 'Type=Primary, Size=Medium, State=Default',
        containing_frame: { name: 'Mobile', containingComponentSet: { nodeId: '100:1', name: 'Button' } },
      }),
    ];

    const result = groupComponentsBySet(components, sets);

    expect(result.componentSets[0].variants[0].properties).toEqual({
      Type: 'Primary',
      Size: 'Medium',
      State: 'Default',
    });
  });

  it('preserves containingFrame name on component sets and standalone', () => {
    const sets = [makeComponentSet({ node_id: '100:1', containing_frame: { name: 'Forms Section' } })];
    const components = [
      makeComponent({
        key: 'c1',
        containing_frame: { name: 'Forms Section', containingComponentSet: { nodeId: '100:1', name: 'Input' } },
      }),
      makeComponent({
        key: 'c2',
        containing_frame: { name: 'Navbar' },
      }),
    ];

    const result = groupComponentsBySet(components, sets);

    expect(result.componentSets[0].containingFrame).toBe('Forms Section');
    expect(result.standalone[0].containingFrame).toBe('Navbar');
  });

  it('returns all standalone when no component sets exist', () => {
    const components = [
      makeComponent({ key: 'c1', containing_frame: { name: 'A' } }),
      makeComponent({ key: 'c2', containing_frame: { name: 'B' } }),
    ];

    const result = groupComponentsBySet(components, []);

    expect(result.componentSets).toHaveLength(0);
    expect(result.standalone).toHaveLength(2);
  });

  it('returns empty result for empty inputs', () => {
    const result = groupComponentsBySet([], []);

    expect(result.componentSets).toHaveLength(0);
    expect(result.standalone).toHaveLength(0);
  });
});
