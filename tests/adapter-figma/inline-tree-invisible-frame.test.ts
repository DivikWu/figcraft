/**
 * Tests for empty frame invisible detection (validateParams step 6 — structural pre-checks).
 *
 * Empty frames with no fills/strokes/children are flagged as invisible.
 * Intentional placeholder frames (icon slots, logo containers, etc.) are
 * downgraded to deterministic confidence so they don't trigger staging.
 * Unnamed empty frames without explicit dimensions remain ambiguous.
 *
 * Note: empty frames with fixed size but NO layoutMode are auto-downgraded
 * to rectangles at step 0 and never reach the invisible check. The invisible
 * check only fires for frames that have layoutMode (or other AL params) but
 * still lack visual content.
 */
import { describe, expect, it } from 'vitest';
import { validateParams } from '../../packages/adapter-figma/src/handlers/inline-tree.js';

// Helper: creates an empty frame child with layoutMode + explicit size so it survives step 0 auto-downgrade
function emptySlot(name?: string): Record<string, unknown> {
  return {
    type: 'frame',
    ...(name ? { name } : {}),
    width: 20,
    height: 20,
    layoutMode: 'HORIZONTAL',
    primaryAxisAlignItems: 'CENTER',
    counterAxisAlignItems: 'CENTER',
  };
}

// Helper: empty frame with layoutMode but NO explicit dimensions — truly ambiguous
function emptySlotNoSize(name?: string): Record<string, unknown> {
  return {
    type: 'frame',
    ...(name ? { name } : {}),
    layoutMode: 'HORIZONTAL',
  };
}

describe('empty frame invisible detection', () => {
  it('marks unnamed empty frame with explicit size as deterministic (dimension heuristic)', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      children: [emptySlot()],
    };

    const result = validateParams(params, 'Row');
    const inv = result.inferences.find((i) => i.field === '_structure' && i.to === 'invisible');

    expect(inv).toBeDefined();
    expect(inv!.confidence).toBe('deterministic');
  });

  it('marks named empty frame with explicit size as deterministic (dimension heuristic)', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      children: [emptySlot('Spacer Box')],
    };

    const result = validateParams(params, 'Row');
    const inv = result.inferences.find((i) => i.field === '_structure' && i.to === 'invisible');

    expect(inv).toBeDefined();
    expect(inv!.confidence).toBe('deterministic');
  });

  it('marks unnamed empty frame without size as ambiguous', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      children: [emptySlotNoSize()],
    };

    const result = validateParams(params, 'Row');
    const inv = result.inferences.find((i) => i.field === '_structure' && i.to === 'invisible');

    expect(inv).toBeDefined();
    expect(inv!.confidence).toBe('ambiguous');
  });

  it('marks non-whitelisted name without size as ambiguous', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      children: [emptySlotNoSize('Random Container')],
    };

    const result = validateParams(params, 'Row');
    const inv = result.inferences.find((i) => i.field === '_structure' && i.to === 'invisible');

    expect(inv).toBeDefined();
    expect(inv!.confidence).toBe('ambiguous');
  });

  it('marks "Icon Slot" as deterministic (not staging-triggering)', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      children: [emptySlot('Icon Slot')],
    };

    const result = validateParams(params, 'Input');
    const inv = result.inferences.find((i) => i.field === '_structure' && i.to === 'invisible');

    expect(inv).toBeDefined();
    expect(inv!.confidence).toBe('deterministic');
    expect(inv!.reason).toContain('placeholder');
  });

  it.each([
    'Mail Icon Slot',
    'Lock Icon Slot',
    'Eye Icon Slot',
    'Logo',
    'Avatar',
    'Image Placeholder',
    'Thumbnail',
    // Structural names (no size needed — name match alone is deterministic)
    // Note: "Spacer" is handled by step 4.6 spacer conversion (SPACER_RE), not invisible detection
    'Status Bar',
    'Divider',
    'Separator',
    'Toolbar',
    'Nav Bar',
    'Tab Bar',
    'Action Bar',
    'Header',
    'Footer',
    'Handle',
    'Home Indicator',
    'Indicator',
  ])('marks "%s" as deterministic', (name) => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      children: [emptySlot(name)],
    };

    const result = validateParams(params, 'Container');
    const inv = result.inferences.find((i) => i.field === '_structure' && i.to === 'invisible');

    expect(inv).toBeDefined();
    expect(inv!.confidence).toBe('deterministic');
  });

  it.each([
    'Status Bar',
    'Divider',
    'Nav Bar',
    'Home Indicator',
  ])('marks "%s" as deterministic even without explicit size (name match)', (name) => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      children: [emptySlotNoSize(name)],
    };

    const result = validateParams(params, 'Container');
    const inv = result.inferences.find((i) => i.field === '_structure' && i.to === 'invisible');

    expect(inv).toBeDefined();
    expect(inv!.confidence).toBe('deterministic');
  });

  it('does not flag frame with fill', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      children: [{ ...emptySlot('Icon Slot'), fill: '#FF0000' }],
    };

    const result = validateParams(params, 'Row');
    const inv = result.inferences.find((i) => i.field === '_structure' && i.to === 'invisible');

    expect(inv).toBeUndefined();
  });

  it('does not flag frame with children', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      children: [
        {
          ...emptySlot('Wrapper'),
          children: [{ type: 'text', content: 'hi' }],
        },
      ],
    };

    const result = validateParams(params, 'Row');
    const inv = result.inferences.find((i) => i.field === '_structure' && i.to === 'invisible');

    expect(inv).toBeUndefined();
  });

  it('does not flag non-frame types', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      children: [{ type: 'text', content: 'hello' }],
    };

    const result = validateParams(params, 'Row');
    const inv = result.inferences.find((i) => i.field === '_structure' && i.to === 'invisible');

    expect(inv).toBeUndefined();
  });

  it('does not flag frame with stroke', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      children: [{ ...emptySlot('Empty'), stroke: '#E5E7EB' }],
    };

    const result = validateParams(params, 'Row');
    const inv = result.inferences.find((i) => i.field === '_structure' && i.to === 'invisible');

    expect(inv).toBeUndefined();
  });

  it('handles case-insensitive name matching ("ICON SLOT" → deterministic)', () => {
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      children: [emptySlot('ICON SLOT')],
    };

    const result = validateParams(params, 'Row');
    const inv = result.inferences.find((i) => i.field === '_structure' && i.to === 'invisible');

    expect(inv).toBeDefined();
    expect(inv!.confidence).toBe('deterministic');
  });

  it('empty frame with fixed size but no layoutMode is downgraded to rectangle (step 0)', () => {
    const child: Record<string, unknown> = { type: 'frame', name: 'Box', width: 20, height: 20 };
    const params: Record<string, unknown> = {
      layoutMode: 'HORIZONTAL',
      children: [child],
    };

    const result = validateParams(params, 'Row');

    // Step 0 converts it to rectangle — no invisible inference
    expect(child.type).toBe('rectangle');
    const inv = result.inferences.find((i) => i.field === '_structure' && i.to === 'invisible');
    expect(inv).toBeUndefined();
  });

  it('Home Indicator with fixed size but no layoutMode stays as frame (step 0 exemption)', () => {
    const child: Record<string, unknown> = { type: 'frame', name: 'Home Indicator', width: 354, height: 34 };
    const params: Record<string, unknown> = {
      layoutMode: 'VERTICAL',
      children: [child],
    };

    const result = validateParams(params, 'Screen');

    // Step 0 exemption: intentional structural name → stays as frame
    expect(child.type).toBe('frame');
    const downgrade = result.inferences.find((i) => i.field === 'type' && i.to === 'rectangle');
    expect(downgrade).toBeUndefined();
  });

  it('Status Bar with fixed size but no layoutMode stays as frame (step 0 exemption)', () => {
    const child: Record<string, unknown> = { type: 'frame', name: 'Status Bar', width: 402, height: 54 };
    const params: Record<string, unknown> = {
      layoutMode: 'VERTICAL',
      children: [child],
    };

    const result = validateParams(params, 'Screen');

    expect(child.type).toBe('frame');
    const downgrade = result.inferences.find((i) => i.field === 'type' && i.to === 'rectangle');
    expect(downgrade).toBeUndefined();
  });
});
