/**
 * P2: `componentPropertyReferences.visible` collector tests.
 *
 * Tests the pure tree-walker that locates inline `componentPropertyReferences`
 * declarations in create_component children. The wiring logic (calling
 * component.findAll + setting componentPropertyReferences on Figma nodes) is
 * verified end-to-end in the plugin; these tests pin the collector's semantics.
 */

import { describe, expect, it } from 'vitest';
import { collectVisibleRefs } from '../../packages/adapter-figma/src/handlers/components.js';

describe('collectVisibleRefs', () => {
  it('returns empty refs + warnings for non-array input', () => {
    expect(collectVisibleRefs(undefined)).toEqual({ refs: [], warnings: [] });
    expect(collectVisibleRefs(null)).toEqual({ refs: [], warnings: [] });
    expect(collectVisibleRefs({})).toEqual({ refs: [], warnings: [] });
    expect(collectVisibleRefs('not an array')).toEqual({ refs: [], warnings: [] });
  });

  it('returns empty for children without any componentPropertyReferences', () => {
    const children = [
      { type: 'text', name: 'Label', content: 'Hello' },
      { type: 'icon', name: 'Check', icon: 'lucide:check' },
    ];
    const result = collectVisibleRefs(children);
    expect(result.refs).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('collects a single top-level visibility ref', () => {
    const children = [
      {
        type: 'icon',
        name: 'Icon',
        icon: 'lucide:arrow-right',
        componentPropertyReferences: { visible: 'Icon' },
      },
    ];
    const result = collectVisibleRefs(children);
    expect(result.refs).toHaveLength(1);
    expect(result.refs[0]).toMatchObject({
      propName: 'Icon',
      childName: 'Icon',
    });
    expect(result.refs[0].path).toContain('Icon');
    expect(result.warnings).toEqual([]);
  });

  it('collects multiple refs across sibling children', () => {
    const children = [
      {
        type: 'icon',
        name: 'LeftIcon',
        componentPropertyReferences: { visible: 'ShowLeftIcon' },
      },
      { type: 'text', name: 'Label', content: 'Click me' },
      {
        type: 'icon',
        name: 'RightIcon',
        componentPropertyReferences: { visible: 'ShowRightIcon' },
      },
    ];
    const result = collectVisibleRefs(children);
    expect(result.refs).toHaveLength(2);
    expect(result.refs.map((r) => r.propName)).toEqual(['ShowLeftIcon', 'ShowRightIcon']);
    expect(result.refs.map((r) => r.childName)).toEqual(['LeftIcon', 'RightIcon']);
  });

  it('collects refs from nested children (recursive walk)', () => {
    const children = [
      {
        type: 'frame',
        name: 'ButtonContent',
        children: [
          {
            type: 'icon',
            name: 'Icon',
            componentPropertyReferences: { visible: 'Icon' },
          },
          { type: 'text', name: 'Label', content: 'Submit' },
        ],
      },
    ];
    const result = collectVisibleRefs(children);
    expect(result.refs).toHaveLength(1);
    expect(result.refs[0].propName).toBe('Icon');
    expect(result.refs[0].childName).toBe('Icon');
    // Path reflects nesting
    expect(result.refs[0].path).toContain('ButtonContent');
    expect(result.refs[0].path).toContain('Icon');
  });

  it('warns when a ref is declared without a name field', () => {
    const children = [
      {
        type: 'icon',
        icon: 'lucide:check',
        componentPropertyReferences: { visible: 'Icon' },
        // NO name → cannot locate target
      },
    ];
    const result = collectVisibleRefs(children);
    expect(result.refs).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('name');
    expect(result.warnings[0]).toContain('Icon');
  });

  it('ignores non-string visible values (robust to agent errors)', () => {
    const children = [
      {
        type: 'icon',
        name: 'Icon',
        componentPropertyReferences: { visible: true }, // wrong type
      },
      {
        type: 'icon',
        name: 'Icon2',
        componentPropertyReferences: { visible: 42 }, // wrong type
      },
    ];
    const result = collectVisibleRefs(children);
    expect(result.refs).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('ignores componentPropertyReferences fields other than visible (forward-compat)', () => {
    // Future fields like `characters` or `mainComponent` should be ignored by
    // this P2 collector — it only handles `visible`. Adding them should not
    // cause false warnings.
    const children = [
      {
        type: 'text',
        name: 'Label',
        componentPropertyReferences: { characters: 'Label' }, // not visible — ignored
      },
      {
        type: 'instance',
        name: 'Avatar',
        componentPropertyReferences: { mainComponent: 'Variant' }, // not visible — ignored
      },
    ];
    const result = collectVisibleRefs(children);
    expect(result.refs).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('still collects the visible field when other fields are present', () => {
    const children = [
      {
        type: 'icon',
        name: 'Icon',
        componentPropertyReferences: {
          visible: 'Icon',
          // Some future field alongside visible — must not break collection
          mainComponent: 'SomeInstance',
        },
      },
    ];
    const result = collectVisibleRefs(children);
    expect(result.refs).toHaveLength(1);
    expect(result.refs[0].propName).toBe('Icon');
  });

  it('handles the full Button use-case (the original bug report)', () => {
    // This is the exact shape the user should be writing after P2 lands.
    const children = [
      {
        type: 'text',
        name: 'Label',
        content: 'Click me',
        componentPropertyName: 'Label', // TEXT binding (separate mechanism)
      },
      {
        type: 'icon',
        name: 'Icon',
        icon: 'lucide:arrow-right',
        componentPropertyReferences: { visible: 'Icon' },
      },
    ];
    const result = collectVisibleRefs(children);
    expect(result.refs).toHaveLength(1);
    expect(result.refs[0]).toMatchObject({
      propName: 'Icon',
      childName: 'Icon',
    });
    expect(result.warnings).toEqual([]);
  });

  it('does not mistake a TEXT componentPropertyName child for a visibility ref', () => {
    // Regression guard: the text-binding path uses `componentPropertyName` (string),
    // NOT `componentPropertyReferences` (object). The two mechanisms must stay
    // independent.
    const children = [
      {
        type: 'text',
        name: 'Label',
        content: 'Submit',
        componentPropertyName: 'Label', // TEXT path — ignored by collectVisibleRefs
      },
    ];
    const result = collectVisibleRefs(children);
    expect(result.refs).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});
