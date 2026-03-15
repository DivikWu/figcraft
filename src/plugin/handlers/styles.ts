/**
 * Styles read handlers — list local paint, text, effect, and grid styles.
 */

import { registerHandler } from '../code.js';

registerHandler('list_styles', async (params) => {
  const styleType = params.type as string | undefined;

  const results: unknown[] = [];

  if (!styleType || styleType === 'PAINT') {
    const paintStyles = await figma.getLocalPaintStylesAsync();
    for (const s of paintStyles) {
      results.push(simplifyPaintStyle(s));
    }
  }

  if (!styleType || styleType === 'TEXT') {
    const textStyles = await figma.getLocalTextStylesAsync();
    for (const s of textStyles) {
      results.push(simplifyTextStyle(s));
    }
  }

  if (!styleType || styleType === 'EFFECT') {
    const effectStyles = await figma.getLocalEffectStylesAsync();
    for (const s of effectStyles) {
      results.push(simplifyEffectStyle(s));
    }
  }

  if (!styleType || styleType === 'GRID') {
    const gridStyles = await figma.getLocalGridStylesAsync();
    for (const s of gridStyles) {
      results.push({
        id: s.id,
        name: s.name,
        type: 'GRID',
        description: s.description,
      });
    }
  }

  return { count: results.length, styles: results };
});

registerHandler('get_style', async (params) => {
  const styleId = params.styleId as string;
  const style = figma.getStyleById(styleId);
  if (!style) {
    return { error: `Style not found: ${styleId}` };
  }

  switch (style.type) {
    case 'PAINT':
      return simplifyPaintStyle(style as PaintStyle);
    case 'TEXT':
      return simplifyTextStyle(style as TextStyle);
    case 'EFFECT':
      return simplifyEffectStyle(style as EffectStyle);
    default:
      return { id: style.id, name: style.name, type: style.type };
  }
});

// ─── Helpers ───

function simplifyPaintStyle(s: PaintStyle): unknown {
  return {
    id: s.id,
    name: s.name,
    type: 'PAINT',
    description: s.description,
    paints: s.paints.map((p) => {
      const base: Record<string, unknown> = { type: p.type, visible: p.visible, opacity: p.opacity };
      if (p.type === 'SOLID') {
        const c = (p as SolidPaint).color;
        const r = Math.round(c.r * 255);
        const g = Math.round(c.g * 255);
        const b = Math.round(c.b * 255);
        base.color = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      }
      return base;
    }),
  };
}

function simplifyTextStyle(s: TextStyle): unknown {
  return {
    id: s.id,
    name: s.name,
    type: 'TEXT',
    description: s.description,
    fontName: s.fontName,
    fontSize: s.fontSize,
    letterSpacing: s.letterSpacing,
    lineHeight: s.lineHeight,
    textCase: s.textCase,
    textDecoration: s.textDecoration,
  };
}

function simplifyEffectStyle(s: EffectStyle): unknown {
  return {
    id: s.id,
    name: s.name,
    type: 'EFFECT',
    description: s.description,
    effects: s.effects.map((e) => {
      const base: Record<string, unknown> = { type: e.type, visible: e.visible };
      if ('radius' in e) base.radius = (e as DropShadowEffect).radius;
      if ('offset' in e) base.offset = (e as DropShadowEffect).offset;
      if ('color' in e) {
        const c = (e as DropShadowEffect).color;
        base.color = `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${c.a.toFixed(2)})`;
      }
      return base;
    }),
  };
}
