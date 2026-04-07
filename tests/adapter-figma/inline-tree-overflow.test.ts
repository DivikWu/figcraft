/**
 * Tests for primary-axis overflow auto-shrink in Opinion Engine (validateParams step 6.0).
 */
import { describe, expect, it } from 'vitest';
import { validateParams } from '../../packages/adapter-figma/src/handlers/inline-tree.js';

describe('primary-axis overflow auto-shrink', () => {
  // ─── HORIZONTAL overflow ───

  it('shrinks fixed-width children when they overflow HORIZONTAL parent', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      width: 402,
      paddingLeft: 24,
      paddingRight: 24,
      itemSpacing: 12,
      children: [
        { type: 'frame', name: 'Box 1', width: 52, height: 64 },
        { type: 'frame', name: 'Box 2', width: 52, height: 64 },
        { type: 'frame', name: 'Box 3', width: 52, height: 64 },
        { type: 'frame', name: 'Box 4', width: 52, height: 64 },
        { type: 'frame', name: 'Box 5', width: 52, height: 64 },
        { type: 'frame', name: 'Box 6', width: 52, height: 64 },
      ],
    };

    // required = 6*52 + 5*12 + 24 + 24 = 312 + 60 + 48 = 420 > 402
    const result = validateParams(params, 'Root');
    const children = params.children as Record<string, unknown>[];

    // Children should have been shrunk
    for (const child of children) {
      expect(child.width).toBeLessThan(52);
      expect(child.width).toBeGreaterThan(0);
    }

    // Total should now fit
    const totalChildWidth = children.reduce((sum, c) => sum + (c.width as number), 0);
    const totalSpacing = 12 * 5;
    const total = totalChildWidth + totalSpacing + 24 + 24;
    expect(total).toBeLessThanOrEqual(402);

    // Should have inference records for each child
    const shrinkInferences = result.inferences.filter(
      (i) => i.field === 'width' && i.reason.includes('shrunk proportionally'),
    );
    expect(shrinkInferences).toHaveLength(6);
    expect(shrinkInferences[0].confidence).toBe('deterministic');
  });

  it('does not shrink when children fit within parent', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      width: 402,
      paddingLeft: 24,
      paddingRight: 24,
      itemSpacing: 8,
      children: [
        { type: 'frame', name: 'Box 1', width: 48, height: 56 },
        { type: 'frame', name: 'Box 2', width: 48, height: 56 },
        { type: 'frame', name: 'Box 3', width: 48, height: 56 },
        { type: 'frame', name: 'Box 4', width: 48, height: 56 },
        { type: 'frame', name: 'Box 5', width: 48, height: 56 },
        { type: 'frame', name: 'Box 6', width: 48, height: 56 },
      ],
    };

    // required = 6*48 + 5*8 + 24 + 24 = 288 + 40 + 48 = 376 <= 402
    validateParams(params, 'Root');
    const children = params.children as Record<string, unknown>[];

    for (const child of children) {
      expect(child.width).toBe(48); // unchanged
    }
  });

  it('skips when clipsContent is true (scrollable container)', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      width: 200,
      clipsContent: true,
      children: [
        { type: 'frame', name: 'Card 1', width: 150, height: 100 },
        { type: 'frame', name: 'Card 2', width: 150, height: 100 },
        { type: 'frame', name: 'Card 3', width: 150, height: 100 },
      ],
    };

    validateParams(params, 'Root');
    const children = params.children as Record<string, unknown>[];

    // Should remain unchanged — clipsContent means intentional overflow
    for (const child of children) {
      expect(child.width).toBe(150);
    }
  });

  it('skips when any child has FILL sizing', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      width: 400,
      children: [
        { type: 'frame', name: 'Fixed', width: 200, height: 50 },
        { type: 'frame', name: 'Flexible', width: 300, height: 50, layoutSizingHorizontal: 'FILL' },
      ],
    };

    validateParams(params, 'Root');
    const children = params.children as Record<string, unknown>[];

    expect(children[0].width).toBe(200); // unchanged
  });

  it('warns instead of shrinking when ratio < 0.5', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      width: 100,
      paddingLeft: 10,
      paddingRight: 10,
      itemSpacing: 10,
      children: [
        { type: 'frame', name: 'Big 1', width: 200, height: 50 },
        { type: 'frame', name: 'Big 2', width: 200, height: 50 },
      ],
    };

    // required = 2*200 + 1*10 + 10 + 10 = 430 > 100
    // available = 100 - 10 - 10 - 10 = 70, ratio = 70/400 = 0.175 < 0.5
    const result = validateParams(params, 'Root');
    const children = params.children as Record<string, unknown>[];

    // Should NOT shrink — ratio too aggressive
    expect(children[0].width).toBe(200);
    expect(children[1].width).toBe(200);

    // Should have a warning inference
    const warnings = result.inferences.filter((i) => i.field === '_widthOverflow');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].confidence).toBe('ambiguous');
  });

  it('skips when parent has no explicit width', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      // no width — parent is HUG or FILL
      children: [
        { type: 'frame', name: 'Box 1', width: 200, height: 50 },
        { type: 'frame', name: 'Box 2', width: 200, height: 50 },
      ],
    };

    validateParams(params, 'Root');
    const children = params.children as Record<string, unknown>[];

    expect(children[0].width).toBe(200); // unchanged
    expect(children[1].width).toBe(200);
  });

  // ─── VERTICAL overflow ───

  it('shrinks fixed-height children when they overflow VERTICAL parent', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'VERTICAL',
      height: 400,
      paddingTop: 20,
      paddingBottom: 20,
      itemSpacing: 10,
      children: [
        { type: 'frame', name: 'Row 1', width: 100, height: 150 },
        { type: 'frame', name: 'Row 2', width: 100, height: 150 },
        { type: 'frame', name: 'Row 3', width: 100, height: 150 },
      ],
    };

    // required = 3*150 + 2*10 + 20 + 20 = 450 + 20 + 40 = 510 > 400
    // available = 400 - 20 - 20 - 20 = 340, ratio = 340/450 = 0.756 >= 0.5
    validateParams(params, 'Root');
    const children = params.children as Record<string, unknown>[];

    for (const child of children) {
      expect(child.height).toBeLessThan(150);
      expect(child.height).toBeGreaterThan(0);
    }

    const totalChildHeight = children.reduce((sum, c) => sum + (c.height as number), 0);
    const total = totalChildHeight + 2 * 10 + 20 + 20;
    expect(total).toBeLessThanOrEqual(400);
  });

  // ─── padding shorthand ───

  it('handles padding shorthand correctly', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      width: 300,
      padding: 40,
      itemSpacing: 10,
      children: [
        { type: 'frame', name: 'Box 1', width: 100, height: 50 },
        { type: 'frame', name: 'Box 2', width: 100, height: 50 },
        { type: 'frame', name: 'Box 3', width: 100, height: 50 },
      ],
    };

    // required = 3*100 + 2*10 + 40 + 40 = 300 + 20 + 80 = 400 > 300
    // available = 300 - 40 - 40 - 20 = 200, ratio = 200/300 = 0.667 >= 0.5
    validateParams(params, 'Root');
    const children = params.children as Record<string, unknown>[];

    for (const child of children) {
      expect(child.width).toBeLessThan(100);
    }
  });

  // ─── single child ───

  it('shrinks single child that exceeds parent', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      width: 300,
      paddingLeft: 24,
      paddingRight: 24,
      children: [{ type: 'frame', name: 'Wide', width: 280, height: 50 }],
    };

    // required = 280 + 24 + 24 = 328 > 300
    // available = 300 - 24 - 24 = 252, ratio = 252/280 = 0.9 >= 0.5
    validateParams(params, 'Root');
    const children = params.children as Record<string, unknown>[];

    expect(children[0].width).toBeLessThanOrEqual(252);
  });
});
