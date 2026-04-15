/**
 * Fix 3: bind_component_property cross-component items[] batch path.
 *
 * Previously the handler took a single nodeId and walked its variants. When
 * an agent had N independent Components/ComponentSets that each needed their
 * own bindings (e.g. 8 "Default" state components, each wanting Icon Left
 * and Icon Right visibility wired), it had to call bind_component_property
 * N times. items[] collapses this into one call with per-item error isolation.
 *
 * These tests pin the batch branch on synthetic Component nodes — the single-
 * component walker is already covered by components-visible-refs.test.ts and
 * end-to-end plugin flows.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../packages/adapter-figma/src/utils/node-lookup.js', () => ({
  findNodeByIdAsync: vi.fn(),
}));

import { registerDesignSystemBuildHandlers } from '../../packages/adapter-figma/src/handlers/design-system-build.js';
import { handlers } from '../../packages/adapter-figma/src/registry.js';
import { findNodeByIdAsync } from '../../packages/adapter-figma/src/utils/node-lookup.js';

type MockedFindNode = ReturnType<typeof vi.fn>;

// Build a minimal Component node with:
//   - a Label TEXT child (for characters bindings)
//   - an Icon FRAME child (for visible bindings)
//   - componentPropertyDefinitions covering Label / Icon
function createComponentNode(id: string, label = 'Button') {
  const labelChild = {
    id: `${id}:label`,
    type: 'TEXT',
    name: 'Label',
    componentPropertyReferences: undefined as Record<string, string> | undefined,
  };
  const iconChild = {
    id: `${id}:icon`,
    type: 'FRAME',
    name: 'Icon',
    componentPropertyReferences: undefined as Record<string, string> | undefined,
    children: [] as unknown[],
  };
  const node = {
    id,
    type: 'COMPONENT',
    name: label,
    componentPropertyDefinitions: {
      // Figma suffixes user-declared props with #id:id — matcher handles that.
      'Label#1:0': { type: 'TEXT', defaultValue: 'Click me' },
      'Icon#2:0': { type: 'BOOLEAN', defaultValue: true },
    },
    children: [labelChild, iconChild],
    findOne(predicate: (n: unknown) => boolean) {
      return [labelChild, iconChild].find(predicate);
    },
  };
  return { node, labelChild, iconChild };
}

describe('bind_component_property items[] batch (Fix 3)', () => {
  beforeEach(() => {
    handlers.clear();
    vi.stubGlobal('figma', {});
    registerDesignSystemBuildHandlers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    handlers.clear();
  });

  it('wires bindings across N independent components in one call', async () => {
    const c1 = createComponentNode('comp:1', 'Button A');
    const c2 = createComponentNode('comp:2', 'Button B');
    const c3 = createComponentNode('comp:3', 'Button C');
    const byId = new Map([
      ['comp:1', c1.node],
      ['comp:2', c2.node],
      ['comp:3', c3.node],
    ]);
    (findNodeByIdAsync as MockedFindNode).mockImplementation(async (id: string) => byId.get(id) ?? null);

    const bindings = [
      { propertyName: 'Label', targetNodeSelector: 'Label', nodeProperty: 'characters' },
      { propertyName: 'Icon', targetNodeSelector: 'Icon', nodeProperty: 'visible' },
    ];

    const handler = handlers.get('bind_component_property');
    const response = (await handler!({
      items: [
        { nodeId: 'comp:1', bindings },
        { nodeId: 'comp:2', bindings },
        { nodeId: 'comp:3', bindings },
      ],
    })) as {
      ok: boolean;
      action: string;
      created: number;
      total: number;
      items: Array<{ nodeId: string; ok: boolean; totalBound?: number; error?: string }>;
    };

    expect(response.action).toBe('batch');
    expect(response.created).toBe(3);
    expect(response.total).toBe(3);
    expect(response.ok).toBe(true);
    expect(response.items.every((i) => i.ok)).toBe(true);

    // Each component must have BOTH children's componentPropertyReferences set.
    for (const { labelChild, iconChild } of [c1, c2, c3]) {
      expect(labelChild.componentPropertyReferences).toEqual({ characters: 'Label#1:0' });
      expect(iconChild.componentPropertyReferences).toEqual({ visible: 'Icon#2:0' });
    }
  });

  it('isolates per-item failures — sibling items continue', async () => {
    const c1 = createComponentNode('comp:10', 'Good A');
    const c3 = createComponentNode('comp:12', 'Good B');
    const byId = new Map([
      ['comp:10', c1.node],
      // comp:11 deliberately missing → should fail its item only
      ['comp:12', c3.node],
    ]);
    (findNodeByIdAsync as MockedFindNode).mockImplementation(async (id: string) => byId.get(id) ?? null);

    const bindings = [{ propertyName: 'Label', targetNodeSelector: 'Label', nodeProperty: 'characters' }];

    const handler = handlers.get('bind_component_property');
    const response = (await handler!({
      items: [
        { nodeId: 'comp:10', bindings },
        { nodeId: 'comp:11', bindings },
        { nodeId: 'comp:12', bindings },
      ],
    })) as {
      ok: boolean;
      created: number;
      total: number;
      items: Array<{ nodeId: string; ok: boolean; error?: string }>;
    };

    expect(response.total).toBe(3);
    expect(response.created).toBe(2);
    expect(response.ok).toBe(false);
    expect(response.items[0].ok).toBe(true);
    expect(response.items[1].ok).toBe(false);
    expect(response.items[1].error).toMatch(/not found|Component/);
    expect(response.items[2].ok).toBe(true);

    // Successful items must still be written despite the sibling failure.
    expect(c1.labelChild.componentPropertyReferences).toEqual({ characters: 'Label#1:0' });
    expect(c3.labelChild.componentPropertyReferences).toEqual({ characters: 'Label#1:0' });
  });

  it('rejects an empty items array', async () => {
    const handler = handlers.get('bind_component_property');
    await expect(handler!({ items: [] })).rejects.toThrow(/items array must not be empty/i);
  });

  it('enforces the 20-item batch limit', async () => {
    const items = Array.from({ length: 21 }, (_, i) => ({
      nodeId: `comp:${i}`,
      bindings: [{ propertyName: 'Label', targetNodeSelector: 'Label', nodeProperty: 'characters' }],
    }));
    const handler = handlers.get('bind_component_property');
    await expect(handler!({ items })).rejects.toThrow(/Maximum 20 components per batch/);
  });

  it('falls back to legacy single-nodeId path when items[] is absent', async () => {
    const c1 = createComponentNode('comp:20');
    (findNodeByIdAsync as MockedFindNode).mockResolvedValue(c1.node);

    const handler = handlers.get('bind_component_property');
    const response = (await handler!({
      nodeId: 'comp:20',
      bindings: [{ propertyName: 'Label', targetNodeSelector: 'Label', nodeProperty: 'characters' }],
    })) as { ok: boolean; action: string; totalBound: number };

    expect(response.action).toBe('single');
    expect(response.ok).toBe(true);
    expect(response.totalBound).toBe(1);
    expect(c1.labelChild.componentPropertyReferences).toEqual({ characters: 'Label#1:0' });
  });
});
