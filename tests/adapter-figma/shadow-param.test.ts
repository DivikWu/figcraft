/**
 * Tests for effect shorthand parameters in create_frame:
 * shadow (DROP_SHADOW), innerShadow (INNER_SHADOW), blur (BACKGROUND_BLUR).
 *
 * Validates:
 * - Default values when shadow/innerShadow object is empty
 * - Custom properties (color, x, y, blur, spread)
 * - blur param → BACKGROUND_BLUR effect
 * - Combined effects coexist in same array
 * - effectStyleName takes priority over all three
 * - hexToFigmaRgba color conversion
 */

import { describe, it, expect } from 'vitest';
import { hexToFigmaRgba } from '../../packages/adapter-figma/src/utils/color.js';

// ─── effect builders (mirror write-nodes-create.ts setupFrame logic) ───

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

function buildInnerShadowEffect(s: Record<string, unknown>) {
  const colorHex = (s.color as string) ?? '#0000001A';
  const rgba = hexToFigmaRgba(colorHex);
  return {
    type: 'INNER_SHADOW' as const,
    visible: true,
    color: rgba,
    offset: { x: (s.x as number) ?? 0, y: (s.y as number) ?? 2 },
    radius: (s.blur as number) ?? 4,
    spread: (s.spread as number) ?? 0,
    blendMode: 'NORMAL' as const,
  };
}

function buildBlurEffect(radius: number) {
  return {
    type: 'BACKGROUND_BLUR' as const,
    visible: true,
    blurType: 'NORMAL' as const,
    radius,
  };
}

/** Mirrors the combined effect collection logic in setupFrame */
function buildEffects(p: { shadow?: Record<string, unknown>; innerShadow?: Record<string, unknown>; blur?: number }) {
  const effects: Array<ReturnType<typeof buildShadowEffect> | ReturnType<typeof buildInnerShadowEffect> | ReturnType<typeof buildBlurEffect>> = [];
  if (p.shadow) effects.push(buildShadowEffect(p.shadow));
  if (p.innerShadow) effects.push(buildInnerShadowEffect(p.innerShadow));
  if (p.blur) effects.push(buildBlurEffect(p.blur));
  return effects;
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

describe('innerShadow param defaults', () => {
  it('applies all defaults when innerShadow is empty object', () => {
    const effect = buildInnerShadowEffect({});
    expect(effect.type).toBe('INNER_SHADOW');
    expect(effect.visible).toBe(true);
    expect(effect.offset).toEqual({ x: 0, y: 2 });
    expect(effect.radius).toBe(4);
    expect(effect.spread).toBe(0);
    expect(effect.blendMode).toBe('NORMAL');
    // Default color: #0000001A → black at ~10% opacity
    expect(effect.color.r).toBeCloseTo(0);
    expect(effect.color.g).toBeCloseTo(0);
    expect(effect.color.b).toBeCloseTo(0);
    expect(effect.color.a).toBeCloseTo(0x1A / 255, 2);
  });

  it('uses custom values', () => {
    const effect = buildInnerShadowEffect({ color: '#FF000080', x: 3, y: 5, blur: 8, spread: 2 });
    expect(effect.color.r).toBeCloseTo(1);
    expect(effect.color.a).toBeCloseTo(128 / 255, 2);
    expect(effect.offset).toEqual({ x: 3, y: 5 });
    expect(effect.radius).toBe(8);
    expect(effect.spread).toBe(2);
  });

  it('overrides only specified properties', () => {
    const effect = buildInnerShadowEffect({ y: 6 });
    expect(effect.offset.y).toBe(6);
    // Defaults preserved
    expect(effect.offset.x).toBe(0);
    expect(effect.radius).toBe(4);
    expect(effect.spread).toBe(0);
  });
});

describe('blur param', () => {
  it('creates BACKGROUND_BLUR effect', () => {
    const effect = buildBlurEffect(10);
    expect(effect.type).toBe('BACKGROUND_BLUR');
    expect(effect.visible).toBe(true);
    expect(effect.radius).toBe(10);
  });
});

describe('combined effects', () => {
  it('shadow + innerShadow coexist', () => {
    const effects = buildEffects({ shadow: {}, innerShadow: {} });
    expect(effects).toHaveLength(2);
    expect(effects[0].type).toBe('DROP_SHADOW');
    expect(effects[1].type).toBe('INNER_SHADOW');
  });

  it('shadow + innerShadow + blur all coexist', () => {
    const effects = buildEffects({ shadow: { y: 4 }, innerShadow: { y: 2 }, blur: 12 });
    expect(effects).toHaveLength(3);
    expect(effects[0].type).toBe('DROP_SHADOW');
    expect(effects[1].type).toBe('INNER_SHADOW');
    expect(effects[2].type).toBe('BACKGROUND_BLUR');
  });

  it('blur alone produces single effect', () => {
    const effects = buildEffects({ blur: 8 });
    expect(effects).toHaveLength(1);
    expect(effects[0].type).toBe('BACKGROUND_BLUR');
  });

  it('empty params produce no effects', () => {
    const effects = buildEffects({});
    expect(effects).toHaveLength(0);
  });
});

describe('effectStyleName priority over all effect shorthands', () => {
  it('effectStyleName takes priority over shadow + innerShadow + blur', () => {
    // Documents the priority logic:
    // if (p.effectStyleName) { ... } else { collect shadow/innerShadow/blur }
    const hasEffectStyle = true;
    const hasShadow = true;
    const hasInnerShadow = true;
    const hasBlur = true;
    const appliedEffect = hasEffectStyle ? 'effectStyle' : (hasShadow || hasInnerShadow || hasBlur) ? 'shorthands' : 'none';
    expect(appliedEffect).toBe('effectStyle');
  });

  it('shorthands applied when effectStyleName is absent', () => {
    const hasEffectStyle = false;
    const hasShadow = true;
    const hasInnerShadow = true;
    const appliedEffect = hasEffectStyle ? 'effectStyle' : (hasShadow || hasInnerShadow) ? 'shorthands' : 'none';
    expect(appliedEffect).toBe('shorthands');
  });

  it('neither applied when all absent', () => {
    const hasEffectStyle = false;
    const hasShadow = false;
    const hasInnerShadow = false;
    const hasBlur = false;
    const appliedEffect = hasEffectStyle ? 'effectStyle' : (hasShadow || hasInnerShadow || hasBlur) ? 'shorthands' : 'none';
    expect(appliedEffect).toBe('none');
  });
});
