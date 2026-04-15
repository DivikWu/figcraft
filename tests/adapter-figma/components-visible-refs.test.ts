/**
 * P2: `componentPropertyReferences.visible` collector tests.
 *
 * The wiring logic (calling component.findAll + setting componentPropertyReferences
 * on Figma nodes) is verified end-to-end in the plugin; these tests pin the
 * collector's semantics.
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
    expect(collectVisibleRefs(children)).toEqual({ refs: [], warnings: [] });
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
    expect(result.refs).toEqual([{ propName: 'Icon', childName: 'Icon' }]);
    expect(result.warnings).toEqual([]);
  });

  it('collects multiple refs across sibling children', () => {
    const children = [
      { type: 'icon', name: 'LeftIcon', componentPropertyReferences: { visible: 'ShowLeftIcon' } },
      { type: 'text', name: 'Label', content: 'Click me' },
      { type: 'icon', name: 'RightIcon', componentPropertyReferences: { visible: 'ShowRightIcon' } },
    ];
    const result = collectVisibleRefs(children);
    expect(result.refs).toEqual([
      { propName: 'ShowLeftIcon', childName: 'LeftIcon' },
      { propName: 'ShowRightIcon', childName: 'RightIcon' },
    ]);
  });

  it('collects refs from nested children (recursive walk)', () => {
    const children = [
      {
        type: 'frame',
        name: 'ButtonContent',
        children: [
          { type: 'icon', name: 'Icon', componentPropertyReferences: { visible: 'Icon' } },
          { type: 'text', name: 'Label', content: 'Submit' },
        ],
      },
    ];
    const result = collectVisibleRefs(children);
    expect(result.refs).toEqual([{ propName: 'Icon', childName: 'Icon' }]);
  });

  it('warns when a ref is declared without a name field', () => {
    const children = [
      {
        type: 'icon',
        icon: 'lucide:check',
        componentPropertyReferences: { visible: 'Icon' },
      },
    ];
    const result = collectVisibleRefs(children);
    expect(result.refs).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('Icon');
    expect(result.warnings[0]).toContain('name');
  });

  it('ignores non-string visible values', () => {
    const children = [
      { type: 'icon', name: 'Icon', componentPropertyReferences: { visible: true } },
      { type: 'icon', name: 'Icon2', componentPropertyReferences: { visible: 42 } },
    ];
    expect(collectVisibleRefs(children)).toEqual({ refs: [], warnings: [] });
  });

  it('handles the full Button use-case (TEXT + BOOLEAN binding mechanisms are independent)', () => {
    const children = [
      {
        type: 'text',
        name: 'Label',
        content: 'Click me',
        componentPropertyName: 'Label', // TEXT path — ignored by visible collector
      },
      {
        type: 'icon',
        name: 'Icon',
        icon: 'lucide:arrow-right',
        componentPropertyReferences: { visible: 'Icon' },
      },
    ];
    const result = collectVisibleRefs(children);
    expect(result.refs).toEqual([{ propName: 'Icon', childName: 'Icon' }]);
    expect(result.warnings).toEqual([]);
  });
});
