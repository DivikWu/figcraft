/**
 * DTCG composite types → Figma Styles mapper.
 *
 * Handles typography → TextStyle and shadow → EffectStyle.
 */

import type { DesignToken } from '@figcraft/shared';
import { hexToFigmaRgba } from '../utils/color.js';

interface TypographyValue {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number | string;
  lineHeight?: number | string;
  letterSpacing?: number | string;
}

interface ShadowValue {
  color?: string;
  offsetX?: number;
  offsetY?: number;
  blur?: number;
  spread?: number;
}

/** Create or update a TextStyle from a DTCG typography token. */
export async function syncTypographyToStyle(
  token: DesignToken,
  existingStyles: Map<string, TextStyle>,
): Promise<{ action: 'created' | 'updated' | 'skipped'; style: TextStyle }> {
  const val = token.value as TypographyValue;
  const name = token.path.replace(/\./g, '/');

  const existing = existingStyles.get(name);

  if (existing) {
    let changed = false;

    if (val.fontFamily && val.fontWeight !== undefined) {
      const weight = resolveWeight(val.fontWeight);
      const fontName = { family: val.fontFamily, style: weight };
      if (existing.fontName.family !== fontName.family || existing.fontName.style !== fontName.style) {
        await figma.loadFontAsync(fontName);
        existing.fontName = fontName;
        changed = true;
      }
    }

    if (val.fontSize !== undefined && existing.fontSize !== val.fontSize) {
      existing.fontSize = val.fontSize;
      changed = true;
    }

    if (val.lineHeight !== undefined) {
      const lh = resolveLineHeight(val.lineHeight);
      if (JSON.stringify(existing.lineHeight) !== JSON.stringify(lh)) {
        existing.lineHeight = lh;
        changed = true;
      }
    }

    if (val.letterSpacing !== undefined) {
      const ls = resolveLetterSpacing(val.letterSpacing);
      if (JSON.stringify(existing.letterSpacing) !== JSON.stringify(ls)) {
        existing.letterSpacing = ls;
        changed = true;
      }
    }

    if (token.description && existing.description !== token.description) {
      existing.description = token.description;
      changed = true;
    }

    return { action: changed ? 'updated' : 'skipped', style: existing };
  }

  // Create new TextStyle
  const style = figma.createTextStyle();
  style.name = name;
  if (token.description) style.description = token.description;

  if (val.fontFamily) {
    const weight = resolveWeight(val.fontWeight);
    const fontName = { family: val.fontFamily, style: weight };
    await figma.loadFontAsync(fontName);
    style.fontName = fontName;
  }
  if (val.fontSize !== undefined) style.fontSize = val.fontSize;
  if (val.lineHeight !== undefined) style.lineHeight = resolveLineHeight(val.lineHeight);
  if (val.letterSpacing !== undefined) style.letterSpacing = resolveLetterSpacing(val.letterSpacing);

  return { action: 'created', style };
}

/** Create or update an EffectStyle from a DTCG shadow token. */
export async function syncShadowToStyle(
  token: DesignToken,
  existingStyles: Map<string, EffectStyle>,
): Promise<{ action: 'created' | 'updated' | 'skipped'; style: EffectStyle }> {
  const shadows = Array.isArray(token.value) ? token.value : [token.value];
  const name = token.path.replace(/\./g, '/');

  const effects: Effect[] = shadows.map((s: ShadowValue) => ({
    type: 'DROP_SHADOW' as const,
    visible: true,
    color: s.color ? hexToFigmaRgba(s.color) : { r: 0, g: 0, b: 0, a: 0.25 },
    offset: { x: s.offsetX ?? 0, y: s.offsetY ?? 0 },
    radius: s.blur ?? 0,
    spread: s.spread ?? 0,
    blendMode: 'NORMAL' as const,
    showShadowBehindNode: false,
  }));

  const existing = existingStyles.get(name);

  if (existing) {
    if (JSON.stringify(existing.effects) === JSON.stringify(effects)) {
      return { action: 'skipped', style: existing };
    }
    existing.effects = effects;
    if (token.description) existing.description = token.description;
    return { action: 'updated', style: existing };
  }

  const style = figma.createEffectStyle();
  style.name = name;
  style.effects = effects;
  if (token.description) style.description = token.description;

  return { action: 'created', style };
}

// ─── Helpers ───

function resolveWeight(weight: number | string | undefined): string {
  if (!weight) return 'Regular';
  const w = typeof weight === 'string' ? parseInt(weight, 10) : weight;
  if (isNaN(w)) return String(weight);
  if (w <= 100) return 'Thin';
  if (w <= 200) return 'ExtraLight';
  if (w <= 300) return 'Light';
  if (w <= 400) return 'Regular';
  if (w <= 500) return 'Medium';
  if (w <= 600) return 'SemiBold';
  if (w <= 700) return 'Bold';
  if (w <= 800) return 'ExtraBold';
  return 'Black';
}

function resolveLineHeight(lh: number | string): LineHeight {
  if (typeof lh === 'string' && lh.endsWith('%')) {
    return { value: parseFloat(lh), unit: 'PERCENT' };
  }
  if (typeof lh === 'number') {
    return { value: lh, unit: 'PIXELS' };
  }
  return { value: parseFloat(String(lh)), unit: 'PIXELS' };
}

function resolveLetterSpacing(ls: number | string): LetterSpacing {
  if (typeof ls === 'string' && ls.endsWith('%')) {
    return { value: parseFloat(ls), unit: 'PERCENT' };
  }
  return { value: typeof ls === 'number' ? ls : parseFloat(String(ls)), unit: 'PIXELS' };
}
