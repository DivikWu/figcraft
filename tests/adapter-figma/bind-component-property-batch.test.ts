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

// Mock applyIconColor — design-system-build's iconColor branch calls into it,
// and we want to verify the call arguments without spinning up the full
// Vector/binding pipeline. Importing icon-svg.js for real would also pull in
// design-context.js (figma globals).
vi.mock('../../packages/adapter-figma/src/handlers/icon-svg.js', () => ({
  applyIconColor: vi.fn().mockResolvedValue({ autoBound: 'var:test' }),
}));

// design-system-build also imports getCachedModeLibrary + resolveFontAsync
// from write-nodes.js; stub them to avoid pulling in figma globals.
vi.mock('../../packages/adapter-figma/src/handlers/write-nodes.js', () => ({
  getCachedModeLibrary: vi.fn().mockResolvedValue(['library', '__local__']),
  resolveFontAsync: vi.fn().mockResolvedValue({ fontName: { family: 'Inter', style: 'Regular' } }),
}));

import { registerDesignSystemBuildHandlers } from '../../packages/adapter-figma/src/handlers/design-system-build.js';
import { applyIconColor } from '../../packages/adapter-figma/src/handlers/icon-svg.js';
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

// ─── B2: iconColor branch + variantFilter ───────────────────────────────────
//
// These tests pin the new build-time bulk-color application path and the
// variantFilter feature added in plan elegant-wandering-raven.md B2.
//
// iconColor uses a different mental model than characters/visible/mainComponent:
// - Not a runtime-overrideable component property
// - Bulk applies a color (hex / variable name / variable ID) to Vector
//   descendants of the matched FRAME/GROUP node
// - propertyName is optional (used only in error messages)
// - Value is auto-detected: hex / VariableID: / bare name

// Build a ComponentSet with N variants, each containing Label + Icon children.
// variantPropertiesByIndex defines the variant axis values per child variant.
function createVariantComponentSet(
  setId: string,
  variantPropertiesByIndex: Array<Record<string, string>>,
): {
  set: any;
  variants: Array<{
    node: any;
    iconChild: any;
  }>;
} {
  const variants = variantPropertiesByIndex.map((vp, i) => {
    const iconChild = {
      id: `${setId}:variant${i}:icon`,
      type: 'FRAME',
      name: 'Icon',
      children: [{ id: `${setId}:variant${i}:icon:vector`, type: 'VECTOR', name: 'Vector' }],
    };
    const labelChild = {
      id: `${setId}:variant${i}:label`,
      type: 'TEXT',
      name: 'Label',
      componentPropertyReferences: undefined as Record<string, string> | undefined,
    };
    const node = {
      id: `${setId}:variant${i}`,
      type: 'COMPONENT',
      name: Object.entries(vp)
        .map(([k, v]) => `${k}=${v}`)
        .join(','),
      variantProperties: vp,
      children: [labelChild, iconChild],
      findOne(predicate: (n: unknown) => boolean) {
        return [labelChild, iconChild].find(predicate);
      },
    };
    return { node, iconChild };
  });
  const set = {
    id: setId,
    type: 'COMPONENT_SET',
    name: 'TestSet',
    componentPropertyDefinitions: {
      'Label#1:0': { type: 'TEXT', defaultValue: 'Label' },
    },
    children: variants.map((v) => v.node),
  };
  return { set, variants };
}

describe('bind_component_property iconColor branch (B2)', () => {
  beforeEach(() => {
    handlers.clear();
    vi.stubGlobal('figma', {});
    registerDesignSystemBuildHandlers();
    (applyIconColor as ReturnType<typeof vi.fn>).mockClear();
    (applyIconColor as ReturnType<typeof vi.fn>).mockResolvedValue({ autoBound: 'var:test' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    handlers.clear();
  });

  it('routes hex value to applyIconColor as fill', async () => {
    const { set } = createVariantComponentSet('cs:hex', [{ Type: 'Tertiary' }]);
    (findNodeByIdAsync as MockedFindNode).mockResolvedValue(set);

    const handler = handlers.get('bind_component_property');
    const response = (await handler!({
      nodeId: 'cs:hex',
      bindings: [{ targetNodeSelector: 'Icon', nodeProperty: 'iconColor', value: '#FF0000' }],
    })) as { ok: boolean; totalBound: number };

    expect(response.ok).toBe(true);
    expect(response.totalBound).toBe(1);
    // applyIconColor(node, fill, varName, library, varId)
    expect(applyIconColor).toHaveBeenCalledTimes(1);
    const call = (applyIconColor as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]).toBe('#FF0000'); // fill arg
    expect(call[2]).toBeUndefined(); // colorVariableName arg
    expect(call[4]).toBeUndefined(); // colorVariableId arg
  });

  it('routes "VariableID:" prefix to applyIconColor as ID', async () => {
    const { set } = createVariantComponentSet('cs:id', [{ Type: 'Tertiary' }]);
    (findNodeByIdAsync as MockedFindNode).mockResolvedValue(set);

    const handler = handlers.get('bind_component_property');
    const response = (await handler!({
      nodeId: 'cs:id',
      bindings: [{ targetNodeSelector: 'Icon', nodeProperty: 'iconColor', value: 'VariableID:123:456' }],
    })) as { ok: boolean; totalBound: number };

    expect(response.ok).toBe(true);
    const call = (applyIconColor as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]).toBeUndefined(); // fill arg
    expect(call[2]).toBeUndefined(); // colorVariableName arg
    expect(call[4]).toBe('VariableID:123:456'); // colorVariableId arg
  });

  it('routes bare name to applyIconColor as variable name', async () => {
    const { set } = createVariantComponentSet('cs:name', [{ Type: 'Tertiary' }]);
    (findNodeByIdAsync as MockedFindNode).mockResolvedValue(set);

    const handler = handlers.get('bind_component_property');
    const response = (await handler!({
      nodeId: 'cs:name',
      bindings: [{ targetNodeSelector: 'Icon', nodeProperty: 'iconColor', value: 'icon/primary' }],
    })) as { ok: boolean; totalBound: number };

    expect(response.ok).toBe(true);
    const call = (applyIconColor as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]).toBeUndefined(); // fill
    expect(call[2]).toBe('icon/primary'); // colorVariableName
    expect(call[3]).toBe('__local__'); // libraryName from getCachedModeLibrary mock
  });

  it('iconColor binding does NOT require propertyName to match a real component property', async () => {
    const { set } = createVariantComponentSet('cs:nolabel', [{ Type: 'Default' }]);
    (findNodeByIdAsync as MockedFindNode).mockResolvedValue(set);

    const handler = handlers.get('bind_component_property');
    // No propertyName passed at all — should not throw PROPERTY_NOT_FOUND
    const response = (await handler!({
      nodeId: 'cs:nolabel',
      bindings: [{ targetNodeSelector: 'Icon', nodeProperty: 'iconColor', value: '#000000' }],
    })) as { ok: boolean; totalBound: number };

    expect(response.ok).toBe(true);
    expect(response.totalBound).toBe(1);
  });

  it('iconColor rejects non-FRAME/GROUP target nodes with a clear error', async () => {
    const { set } = createVariantComponentSet('cs:wrongtype', [{ Type: 'Default' }]);
    (findNodeByIdAsync as MockedFindNode).mockResolvedValue(set);

    const handler = handlers.get('bind_component_property');
    const response = (await handler!({
      nodeId: 'cs:wrongtype',
      // Label is a TEXT node, not a FRAME — iconColor should reject it
      bindings: [{ targetNodeSelector: 'Label', nodeProperty: 'iconColor', value: '#000' }],
    })) as { ok: boolean; errors?: Array<{ error: string }> };

    expect(response.ok).toBe(false);
    expect(response.errors).toBeDefined();
    expect(response.errors![0].error).toMatch(/not FRAME\/GROUP|TEXT/);
  });

  it('iconColor rejects missing or empty value', async () => {
    const { set } = createVariantComponentSet('cs:novalue', [{ Type: 'Default' }]);
    (findNodeByIdAsync as MockedFindNode).mockResolvedValue(set);

    const handler = handlers.get('bind_component_property');
    await expect(
      handler!({
        nodeId: 'cs:novalue',
        bindings: [{ targetNodeSelector: 'Icon', nodeProperty: 'iconColor', value: '' }],
      }),
    ).rejects.toThrow(/iconColor binding requires "value"/);
  });

  it('two iconColor bindings on the same selector without propertyName do NOT collide', async () => {
    // Regression: an earlier version synthesized label `iconColor:Icon` for
    // both entries, so perBinding.set overwrote the first counter and the
    // binding loop silently reported bound:2 while only the second value
    // actually took effect. The indexed label (`iconColor:Icon#0` vs `#1`)
    // keeps them distinct in the response.
    const { set } = createVariantComponentSet('cs:collision', [{ Type: 'Default' }]);
    (findNodeByIdAsync as MockedFindNode).mockResolvedValue(set);

    const handler = handlers.get('bind_component_property');
    const response = (await handler!({
      nodeId: 'cs:collision',
      bindings: [
        { targetNodeSelector: 'Icon', nodeProperty: 'iconColor', value: '#000000' },
        { targetNodeSelector: 'Icon', nodeProperty: 'iconColor', value: '#FFFFFF' },
      ],
    })) as {
      ok: boolean;
      totalBound: number;
      results: Array<{ propertyName: string; bound: number }>;
    };

    expect(response.ok).toBe(true);
    // Both bindings should apply, so both fired applyIconColor once per variant.
    expect(applyIconColor).toHaveBeenCalledTimes(2);
    // Both bindings must appear as distinct per-binding entries in the response.
    expect(response.results).toHaveLength(2);
    expect(response.results.map((r) => r.propertyName).sort()).toEqual(['iconColor:Icon#0', 'iconColor:Icon#1']);
    // Both must report bound:1 (not one showing bound:2 and the other missing).
    expect(response.results.every((r) => r.bound === 1)).toBe(true);
  });
});

describe('bind_component_property variantFilter (B2)', () => {
  beforeEach(() => {
    handlers.clear();
    vi.stubGlobal('figma', {});
    registerDesignSystemBuildHandlers();
    (applyIconColor as ReturnType<typeof vi.fn>).mockClear();
    (applyIconColor as ReturnType<typeof vi.fn>).mockResolvedValue({ autoBound: 'var:test' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    handlers.clear();
  });

  it('limits binding application to variants matching the filter', async () => {
    // 4 variants: Type=Emphasis|Tertiary x Size=sm|md
    const { set } = createVariantComponentSet('cs:filter', [
      { Type: 'Emphasis', Size: 'sm' },
      { Type: 'Emphasis', Size: 'md' },
      { Type: 'Tertiary', Size: 'sm' },
      { Type: 'Tertiary', Size: 'md' },
    ]);
    (findNodeByIdAsync as MockedFindNode).mockResolvedValue(set);

    const handler = handlers.get('bind_component_property');
    const response = (await handler!({
      nodeId: 'cs:filter',
      variantFilter: { Type: 'Tertiary' },
      bindings: [{ targetNodeSelector: 'Icon', nodeProperty: 'iconColor', value: 'icon/primary' }],
    })) as { ok: boolean; totalBound: number; variantsTargeted: number };

    expect(response.ok).toBe(true);
    // Only 2 of 4 variants should match (Tertiary sm + Tertiary md)
    expect(response.variantsTargeted).toBe(2);
    expect(response.totalBound).toBe(2);
    expect(applyIconColor).toHaveBeenCalledTimes(2);
  });

  it('throws VARIANT_FILTER_NO_MATCH when filter matches zero variants', async () => {
    const { set } = createVariantComponentSet('cs:nomatch', [{ Type: 'Emphasis' }, { Type: 'Default' }]);
    (findNodeByIdAsync as MockedFindNode).mockResolvedValue(set);

    const handler = handlers.get('bind_component_property');
    await expect(
      handler!({
        nodeId: 'cs:nomatch',
        variantFilter: { Type: 'Tertiary' },
        bindings: [{ targetNodeSelector: 'Icon', nodeProperty: 'iconColor', value: '#000' }],
      }),
    ).rejects.toThrow(/matched 0 variants/);
  });

  it('combines filter with property-reference bindings (not just iconColor)', async () => {
    const { set } = createVariantComponentSet('cs:combined', [{ State: 'Default' }, { State: 'Disabled' }]);
    (findNodeByIdAsync as MockedFindNode).mockResolvedValue(set);

    const handler = handlers.get('bind_component_property');
    const response = (await handler!({
      nodeId: 'cs:combined',
      variantFilter: { State: 'Default' },
      bindings: [{ propertyName: 'Label', targetNodeSelector: 'Label', nodeProperty: 'characters' }],
    })) as { ok: boolean; variantsTargeted: number; totalBound: number };

    expect(response.ok).toBe(true);
    expect(response.variantsTargeted).toBe(1);
    expect(response.totalBound).toBe(1);
  });
});
