/**
 * Tests for SPACE_BETWEEN + FILL text + small siblings auto-downgrade (validateParams step 4.55).
 *
 * When a HORIZONTAL container uses SPACE_BETWEEN with a [small, FILL, small] pattern
 * (e.g. icon + text + chevron), itemSpacing is ignored. The rule downgrades to MIN.
 */
import { describe, expect, it } from 'vitest';
import { validateParams } from '../../packages/adapter-figma/src/handlers/inline-tree.js';

describe('SPACE_BETWEEN + FILL text + small siblings → MIN downgrade', () => {
  it('downgrades SPACE_BETWEEN to MIN for [icon, FILL-text, chevron] pattern', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      primaryAxisAlignItems: 'SPACE_BETWEEN',
      counterAxisAlignItems: 'CENTER',
      itemSpacing: 12,
      height: 52,
      children: [
        { type: 'icon', name: 'icon', icon: 'lucide:settings', width: 22, height: 22 },
        { type: 'text', name: 'Label', content: 'Settings', layoutSizingHorizontal: 'FILL' },
        { type: 'icon', name: 'chevron', icon: 'lucide:chevron-right', width: 20, height: 20 },
      ],
    };

    const result = validateParams(params, 'Menu Item');

    expect(params.primaryAxisAlignItems).toBe('MIN');

    const downgrade = result.inferences.find(
      (i) => i.field === 'primaryAxisAlignItems' && i.from === 'SPACE_BETWEEN' && i.to === 'MIN',
    );
    expect(downgrade).toBeDefined();
    expect(downgrade!.confidence).toBe('deterministic');
    expect(downgrade!.reason).toContain('itemSpacing is ignored');
  });

  it('does not downgrade when no FILL child exists', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      primaryAxisAlignItems: 'SPACE_BETWEEN',
      itemSpacing: 12,
      children: [
        { type: 'frame', name: 'Left', width: 100, height: 40 },
        { type: 'frame', name: 'Right', width: 100, height: 40 },
        { type: 'icon', name: 'icon', icon: 'lucide:x', width: 20, height: 20 },
      ],
    };

    validateParams(params, 'Row');

    expect(params.primaryAxisAlignItems).toBe('SPACE_BETWEEN');
  });

  it('does not downgrade when fewer than 2 small elements', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      primaryAxisAlignItems: 'SPACE_BETWEEN',
      itemSpacing: 12,
      children: [
        { type: 'text', name: 'Label', content: 'Hello', layoutSizingHorizontal: 'FILL' },
        { type: 'icon', name: 'chevron', icon: 'lucide:chevron-right', width: 20, height: 20 },
      ],
    };

    validateParams(params, 'Row');

    expect(params.primaryAxisAlignItems).toBe('SPACE_BETWEEN');
  });

  it('does not downgrade VERTICAL containers', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'VERTICAL',
      primaryAxisAlignItems: 'SPACE_BETWEEN',
      itemSpacing: 12,
      children: [
        { type: 'icon', name: 'icon', icon: 'lucide:settings', width: 22, height: 22 },
        { type: 'text', name: 'Label', content: 'Settings', layoutSizingHorizontal: 'FILL' },
        { type: 'icon', name: 'chevron', icon: 'lucide:chevron-right', width: 20, height: 20 },
      ],
    };

    validateParams(params, 'Column');

    expect(params.primaryAxisAlignItems).toBe('SPACE_BETWEEN');
  });

  it('does not downgrade when primaryAxisAlignItems is MIN', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      primaryAxisAlignItems: 'MIN',
      itemSpacing: 12,
      children: [
        { type: 'icon', name: 'icon', icon: 'lucide:settings', width: 22, height: 22 },
        { type: 'text', name: 'Label', content: 'Settings', layoutSizingHorizontal: 'FILL' },
        { type: 'icon', name: 'chevron', icon: 'lucide:chevron-right', width: 20, height: 20 },
      ],
    };

    validateParams(params, 'Row');

    expect(params.primaryAxisAlignItems).toBe('MIN');
  });

  it('handles frame children with small fixed dimensions as small elements', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      primaryAxisAlignItems: 'SPACE_BETWEEN',
      itemSpacing: 12,
      children: [
        { type: 'frame', name: 'Icon Wrapper', width: 24, height: 24 },
        { type: 'text', name: 'Label', content: 'Account', layoutSizingHorizontal: 'FILL' },
        { type: 'frame', name: 'Chevron Wrapper', width: 20, height: 20 },
      ],
    };

    const result = validateParams(params, 'Menu Item');

    expect(params.primaryAxisAlignItems).toBe('MIN');
    const downgrade = result.inferences.find((i) => i.field === 'primaryAxisAlignItems');
    expect(downgrade).toBeDefined();
  });

  it('downgrades with more than 3 children when pattern matches', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      primaryAxisAlignItems: 'SPACE_BETWEEN',
      itemSpacing: 12,
      children: [
        { type: 'icon', name: 'icon', icon: 'lucide:settings', width: 22, height: 22 },
        { type: 'text', name: 'Label', content: 'Settings', layoutSizingHorizontal: 'FILL' },
        { type: 'frame', name: 'Badge', width: 8, height: 8 },
        { type: 'icon', name: 'chevron', icon: 'lucide:chevron-right', width: 20, height: 20 },
      ],
    };

    validateParams(params, 'Menu Item');

    expect(params.primaryAxisAlignItems).toBe('MIN');
  });

  it('downgrades when FILL child is a frame, not text', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      primaryAxisAlignItems: 'SPACE_BETWEEN',
      itemSpacing: 12,
      children: [
        { type: 'frame', name: 'Icon', width: 24, height: 24 },
        { type: 'frame', name: 'Content', layoutSizingHorizontal: 'FILL' },
        { type: 'frame', name: 'Chevron', width: 20, height: 20 },
      ],
    };

    validateParams(params, 'Row');

    expect(params.primaryAxisAlignItems).toBe('MIN');
  });

  it('matches icon type without explicit width/height', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      primaryAxisAlignItems: 'SPACE_BETWEEN',
      itemSpacing: 12,
      children: [
        { type: 'icon', name: 'icon', icon: 'lucide:settings' },
        { type: 'text', name: 'Label', content: 'Settings', layoutSizingHorizontal: 'FILL' },
        { type: 'icon', name: 'chevron', icon: 'lucide:chevron-right' },
      ],
    };

    validateParams(params, 'Menu Item');

    expect(params.primaryAxisAlignItems).toBe('MIN');
  });

  it('does not match wide element as small (200x20 divider)', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      primaryAxisAlignItems: 'SPACE_BETWEEN',
      itemSpacing: 12,
      children: [
        { type: 'frame', name: 'Divider', width: 200, height: 1 },
        { type: 'text', name: 'Label', content: 'Hello', layoutSizingHorizontal: 'FILL' },
        { type: 'frame', name: 'Small', width: 20, height: 20 },
      ],
    };

    validateParams(params, 'Row');

    // Divider is 200px wide — should NOT count as small, so only 1 small element, rule doesn't trigger
    expect(params.primaryAxisAlignItems).toBe('SPACE_BETWEEN');
  });

  it('does not downgrade for CENTER alignment', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      primaryAxisAlignItems: 'CENTER',
      itemSpacing: 12,
      children: [
        { type: 'icon', name: 'icon', icon: 'lucide:settings', width: 22, height: 22 },
        { type: 'text', name: 'Label', content: 'Settings', layoutSizingHorizontal: 'FILL' },
        { type: 'icon', name: 'chevron', icon: 'lucide:chevron-right', width: 20, height: 20 },
      ],
    };

    validateParams(params, 'Row');

    expect(params.primaryAxisAlignItems).toBe('CENTER');
  });
});
