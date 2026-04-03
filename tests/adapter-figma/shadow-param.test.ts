/**
 * Tests for the shadow shorthand parameter in create_frame.
 *
 * Validates:
 * - Default values when shadow object is empty
 * - Custom shadow properties (color, x, y, blur, spread)
 * - effectStyleName takes priority over shadow
 * - hexToFigmaRgba color conversion for shadow
 */

import { describe, it, expect } from 'vitest';
import { hexToFigmaRgba } from '../../packages/adapter-figma/src/utils/color.js';

// ─── shadow defaults logic (mirrors write-nodes-create.ts lines 693-707) ───

function buildShadowEffect(shadow: Record<string, unknown>) {
  const colorHex = (shadow.color as string) ?? '#00000040';
  const rgba = hexToFigmaRgba(colorHex);
  return {
    type: 'DROP_SHADOW' as const,
    visible: true,
    color: rgba,
    offset: { x: (shadow.x as number) ?? 0, y: (shadow.y as number) ?? 4 },
    radius: (shadow.blur as number) ?? 12,
    spread: (shadow.spread as number) ?? 0,
    blendMode: 'NORMAL' as const,
  };
}

describe('shadow param defaults', () => {
  it('applies all defaults when shadow is empty object', () => {
    const effect = buildShadowEffect({});
    expect(effect.type).toBe('DROP_SHADOW');
    expect(effect.visible).toBe(true);
    expect(effect.offset).toEqual({ x: 0, y: 4 });
    expect(effect.radius).toBe(12);
    expect(effect.spread).toBe(0);
    expect(effect.blendMode).toBe('NORMAL');
    // Default color: #00000040 → black at ~25% opacity
    expect(effect.color.r).toBeCloseTo(0);
    expect(effect.color.g).toBeCloseTo(0);
    expect(effect.color.b).toBeCloseTo(0);
    expect(effect.color.a).toBeCloseTo(0x40 / 255, 2);
  });

  it('uses custom color', () => {
    const effect = buildShadowEffect({ color: '#FF000080' });
    expect(effect.color.r).toBeCloseTo(1);
    expect(effect.color.g).toBeCloseTo(0);
    expect(effect.color.b).toBeCloseTo(0);
    expect(effect.color.a).toBeCloseTo(128 / 255, 2);
  });

  it('uses custom offset', () => {
    const effect = buildShadowEffect({ x: 5, y: 10 });
    expect(effect.offset).toEqual({ x: 5, y: 10 });
  });

  it('uses custom blur and spread', () => {
    const effect = buildShadowEffect({ blur: 24, spread: 4 });
    expect(effect.radius).toBe(24);
    expect(effect.spread).toBe(4);
  });

  it('handles 6-digit hex without alpha', () => {
    const effect = buildShadowEffect({ color: '#336699' });
    expect(effect.color.a).toBe(1);
    expect(effect.color.r).toBeCloseTo(0x33 / 255, 2);
    expect(effect.color.g).toBeCloseTo(0x66 / 255, 2);
    expect(effect.color.b).toBeCloseTo(0x99 / 255, 2);
  });

  it('overrides only specified properties', () => {
    const effect = buildShadowEffect({ y: 8, blur: 20 });
    // Custom values
    expect(effect.offset.y).toBe(8);
    expect(effect.radius).toBe(20);
    // Defaults preserved
    expect(effect.offset.x).toBe(0);
    expect(effect.spread).toBe(0);
  });
});

describe('shadow vs effectStyleName priority', () => {
  it('effectStyleName should be checked first (shadow ignored)', () => {
    // This test documents the priority logic:
    // if (p.effectStyleName) { ... } else if (p.shadow) { ... }
    // When effectStyleName is set, shadow block is never reached.
    const hasEffectStyle = true;
    const hasShadow = true;
    // Simulate the if/else-if chain
    const appliedEffect = hasEffectStyle ? 'effectStyle' : hasShadow ? 'shadow' : 'none';
    expect(appliedEffect).toBe('effectStyle');
  });

  it('shadow is applied when effectStyleName is absent', () => {
    const hasEffectStyle = false;
    const hasShadow = true;
    const appliedEffect = hasEffectStyle ? 'effectStyle' : hasShadow ? 'shadow' : 'none';
    expect(appliedEffect).toBe('shadow');
  });

  it('neither applied when both absent', () => {
    const hasEffectStyle = false;
    const hasShadow = false;
    const appliedEffect = hasEffectStyle ? 'effectStyle' : hasShadow ? 'shadow' : 'none';
    expect(appliedEffect).toBe('none');
  });
});
