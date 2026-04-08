/**
 * Tests for input field pattern [icon, text, icon] → middle text FILL (validateParams step 4.57).
 *
 * In HORIZONTAL layouts with [small/icon, text, small/icon] children,
 * the middle text should auto-FILL to push the trailing icon to the right edge.
 * Common in input fields (e.g. lock + password + eye-off).
 */
import { describe, expect, it } from 'vitest';
import { validateParams } from '../../packages/adapter-figma/src/handlers/inline-tree.js';

describe('input field pattern [icon, text, icon] → middle text FILL', () => {
  it('should FILL middle text when flanked by icons', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      children: [
        { type: 'icon', icon: 'lucide:lock', size: 20 },
        { type: 'text', content: '••••••••' },
        { type: 'icon', icon: 'lucide:eye-off', size: 20 },
      ],
    };

    const result = validateParams(params, 'Input / Password');
    const middle = (params.children as Record<string, unknown>[])[1];

    expect(middle.layoutSizingHorizontal).toBe('FILL');
    expect(result.inferences.some((i) => i.field === 'layoutSizingHorizontal' && i.to === 'FILL')).toBe(true);
  });

  it('should FILL middle text when flanked by small frames', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      children: [
        { type: 'frame', width: 20, height: 20, name: 'Icon Left' },
        { type: 'text', content: 'name@example.com', name: 'Placeholder' },
        { type: 'frame', width: 20, height: 20, name: 'Icon Right' },
      ],
    };

    validateParams(params, 'Input / Email');
    const middle = (params.children as Record<string, unknown>[])[1];

    expect(middle.layoutSizingHorizontal).toBe('FILL');
  });

  it('should FILL middle text when flanked by svg children', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      children: [
        { type: 'svg', svg: '<svg></svg>', width: 24, height: 24 },
        { type: 'text', content: 'Search...' },
        { type: 'svg', svg: '<svg></svg>', width: 16, height: 16 },
      ],
    };

    validateParams(params, 'Search Input');
    const middle = (params.children as Record<string, unknown>[])[1];

    expect(middle.layoutSizingHorizontal).toBe('FILL');
  });

  it('should NOT override explicit sizing on middle text', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      children: [
        { type: 'icon', icon: 'lucide:lock', size: 20 },
        { type: 'text', content: '••••••••', layoutSizingHorizontal: 'HUG' },
        { type: 'icon', icon: 'lucide:eye-off', size: 20 },
      ],
    };

    validateParams(params, 'Input / Password');
    const middle = (params.children as Record<string, unknown>[])[1];

    expect(middle.layoutSizingHorizontal).toBe('HUG');
  });

  it('should NOT trigger for VERTICAL layouts', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'VERTICAL',
      children: [
        { type: 'icon', icon: 'lucide:lock', size: 20 },
        { type: 'text', content: '••••••••' },
        { type: 'icon', icon: 'lucide:eye-off', size: 20 },
      ],
    };

    validateParams(params, 'Column');
    const middle = (params.children as Record<string, unknown>[])[1];

    expect(middle.layoutSizingHorizontal).toBeUndefined();
  });

  it('should NOT trigger when middle child is not text', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      children: [
        { type: 'icon', icon: 'lucide:lock', size: 20 },
        { type: 'frame', name: 'Content' },
        { type: 'icon', icon: 'lucide:eye-off', size: 20 },
      ],
    };

    validateParams(params, 'Row');
    const middle = (params.children as Record<string, unknown>[])[1];

    expect(middle.layoutSizingHorizontal).toBeUndefined();
  });

  it('should NOT trigger when first child is large (not icon-like)', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      children: [
        { type: 'frame', width: 200, height: 40, name: 'Large Frame' },
        { type: 'text', content: 'Label' },
        { type: 'icon', icon: 'lucide:chevron-right', size: 20 },
      ],
    };

    validateParams(params, 'Row');
    const middle = (params.children as Record<string, unknown>[])[1];

    expect(middle.layoutSizingHorizontal).toBeUndefined();
  });

  it('should NOT trigger with only 2 children', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      children: [
        { type: 'icon', icon: 'lucide:lock', size: 20 },
        { type: 'text', content: '••••••••' },
      ],
    };

    validateParams(params, 'Input');
    const middle = (params.children as Record<string, unknown>[])[1];

    expect(middle.layoutSizingHorizontal).toBeUndefined();
  });
});
