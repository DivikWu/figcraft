/**
 * Tests for SPACE_BETWEEN + single child → FILL on primary axis (validateParams step 4.56).
 *
 * A single HUG child under SPACE_BETWEEN defeats the distribution intent.
 * The rule sets the child's primary-axis sizing to FILL.
 */
import { describe, expect, it } from 'vitest';
import { validateParams } from '../../packages/adapter-figma/src/handlers/inline-tree.js';

describe('SPACE_BETWEEN + single child → FILL on primary axis', () => {
  it('sets layoutSizingVertical to FILL for single child in VERTICAL SPACE_BETWEEN parent', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'VERTICAL',
      primaryAxisAlignItems: 'SPACE_BETWEEN',
      padding: 24,
      width: 402,
      height: 874,
      children: [{ type: 'frame', name: 'Content' }],
    };

    const result = validateParams(params, 'Screen');
    const child = (params.children as Record<string, unknown>[])[0];

    expect(child.layoutSizingVertical).toBe('FILL');

    const inference = result.inferences.find((i) => i.field === 'layoutSizingVertical' && i.to === 'FILL');
    expect(inference).toBeDefined();
    expect(inference!.confidence).toBe('deterministic');
    expect(inference!.reason).toContain('SPACE_BETWEEN');
  });

  it('sets layoutSizingHorizontal to FILL for single child in HORIZONTAL SPACE_BETWEEN parent', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      primaryAxisAlignItems: 'SPACE_BETWEEN',
      children: [{ type: 'frame', name: 'Content' }],
    };

    validateParams(params, 'Row');
    const child = (params.children as Record<string, unknown>[])[0];

    expect(child.layoutSizingHorizontal).toBe('FILL');
  });

  it('does not override explicit child sizing', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'VERTICAL',
      primaryAxisAlignItems: 'SPACE_BETWEEN',
      children: [{ type: 'frame', name: 'Content', layoutSizingVertical: 'HUG' }],
    };

    validateParams(params, 'Screen');
    const child = (params.children as Record<string, unknown>[])[0];

    expect(child.layoutSizingVertical).toBe('HUG');
  });

  it('does not set FILL when 2+ children exist', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'VERTICAL',
      primaryAxisAlignItems: 'SPACE_BETWEEN',
      children: [
        { type: 'frame', name: 'Top' },
        { type: 'frame', name: 'Bottom' },
      ],
    };

    validateParams(params, 'Screen');
    const children = params.children as Record<string, unknown>[];

    expect(children[0].layoutSizingVertical).toBeUndefined();
    expect(children[1].layoutSizingVertical).toBeUndefined();
  });

  it('does not trigger for non-SPACE_BETWEEN alignment', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'VERTICAL',
      primaryAxisAlignItems: 'CENTER',
      children: [{ type: 'frame', name: 'Content' }],
    };

    validateParams(params, 'Screen');
    const child = (params.children as Record<string, unknown>[])[0];

    expect(child.layoutSizingVertical).toBeUndefined();
  });
});
