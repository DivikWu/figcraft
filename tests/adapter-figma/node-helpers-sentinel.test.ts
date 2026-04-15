/**
 * P0-A: Text binding sentinel tests.
 *
 * When a text-role fill binding fails, withSentinel must write a hot-magenta
 * sentinel fill so the failure is visible in screenshots. Frame/border
 * failures must stay silent to avoid false positives on intentional no-fill
 * surfaces.
 */

import { describe, expect, it } from 'vitest';
import { SENTINEL_TEXT_FAIL_FILL, withSentinel } from '../../packages/adapter-figma/src/utils/node-helpers.js';

function createMockNode() {
  return {
    type: 'TEXT',
    fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }] as unknown,
  } as unknown as SceneNode & MinimalFillsMixin;
}

describe('withSentinel', () => {
  it('returns successful result unchanged', () => {
    const node = createMockNode();
    const before = (node.fills as unknown as SolidPaint[])[0];
    const result = withSentinel({ autoBound: 'var:text/primary' }, node, 'textColor');
    expect(result.autoBound).toBe('var:text/primary');
    expect((node.fills as unknown as SolidPaint[])[0]).toBe(before);
  });

  it('returns failure without bindingFailure unchanged', () => {
    const node = createMockNode();
    const before = (node.fills as unknown as SolidPaint[])[0];
    const result = withSentinel({ autoBound: null, colorHint: 'some input shape error' }, node, 'textColor');
    expect(result.colorHint).toBe('some input shape error');
    expect((node.fills as unknown as SolidPaint[])[0]).toBe(before);
  });

  it('applies magenta fill + hint prefix on textColor binding failure', () => {
    const node = createMockNode();
    const result = withSentinel(
      {
        autoBound: null,
        colorHint: '⛔ Variable name "text/missing" not found in library "DS".',
        bindingFailure: { requested: 'text/missing', type: 'variable', action: 'skipped' },
      },
      node,
      'textColor',
    );
    expect((node.fills as unknown as SolidPaint[])[0]).toEqual(SENTINEL_TEXT_FAIL_FILL);
    expect(result.colorHint).toContain('Sentinel magenta applied');
    expect(result.colorHint).toContain('Variable name "text/missing" not found');
    expect(result.bindingFailure).toBeDefined();
    expect(result.autoBound).toBeNull();
  });

  it('applies sentinel for headingColor and textSecondary roles', () => {
    for (const role of ['headingColor', 'textSecondary']) {
      const node = createMockNode();
      const result = withSentinel(
        {
          autoBound: null,
          colorHint: 'not found',
          bindingFailure: { requested: 'x', type: 'variable', action: 'skipped' },
        },
        node,
        role,
      );
      expect((node.fills as unknown as SolidPaint[])[0]).toEqual(SENTINEL_TEXT_FAIL_FILL);
      expect(result.colorHint).toContain('Sentinel magenta applied');
    }
  });

  it('does NOT apply sentinel on background-role binding failure', () => {
    const node = createMockNode();
    const before = (node.fills as unknown as SolidPaint[])[0];
    const result = withSentinel(
      {
        autoBound: null,
        colorHint: 'Variable "bg/missing" not found.',
        bindingFailure: { requested: 'bg/missing', type: 'variable', action: 'skipped' },
      },
      node,
      'background',
    );
    expect((node.fills as unknown as SolidPaint[])[0]).toBe(before);
    expect(result.colorHint).toBe('Variable "bg/missing" not found.');
    expect(result.bindingFailure).toBeDefined();
  });

  it('does NOT apply sentinel on border-role binding failure', () => {
    const node = createMockNode();
    const before = (node.fills as unknown as SolidPaint[])[0];
    const result = withSentinel(
      {
        autoBound: null,
        colorHint: 'border variable not found',
        bindingFailure: { requested: 'border/missing', type: 'variable', action: 'skipped' },
      },
      node,
      'border',
    );
    expect((node.fills as unknown as SolidPaint[])[0]).toBe(before);
    expect(result.colorHint).toBe('border variable not found');
  });

  it('generates default hint when colorHint is missing on text-role failure', () => {
    const node = createMockNode();
    const result = withSentinel(
      {
        autoBound: null,
        bindingFailure: { requested: 'text/primary', type: 'variable', action: 'skipped' },
      },
      node,
      'textColor',
    );
    expect(result.colorHint).toContain('Sentinel magenta applied');
    expect(result.colorHint).toContain('Binding failed for "text/primary"');
  });

  it('preserves bindingFailure action (scope-mismatch / ambiguous) through the wrapper', () => {
    for (const action of ['scope-mismatch', 'ambiguous'] as const) {
      const node = createMockNode();
      const result = withSentinel(
        {
          autoBound: null,
          colorHint: 'detail',
          bindingFailure: { requested: 'x', type: 'variable', action },
        },
        node,
        'textColor',
      );
      expect(result.bindingFailure?.action).toBe(action);
      expect((node.fills as unknown as SolidPaint[])[0]).toEqual(SENTINEL_TEXT_FAIL_FILL);
    }
  });
});
