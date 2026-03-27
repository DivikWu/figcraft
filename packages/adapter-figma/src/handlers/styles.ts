/**
 * Styles read handlers — list local paint, text, effect, and grid styles.
 */

import { registerHandler } from '../registry.js';
import { figmaRgbaToHex } from '../utils/color.js';
import { assertHandler } from '../utils/handler-error.js';
import {
  registerStyles,
  registerStylesIncremental,
  getRegisteredStylesSummary,
  type RegisteredStyles,
} from '../utils/style-registry.js';

export function registerStyleHandlers(): void {

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
  assertHandler(style, `Style not found: ${styleId}`, 'NOT_FOUND');

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

registerHandler('register_library_styles', async (params) => {
  const library = params.library as string;
  const styles = params.styles as RegisteredStyles;
  const counts = await registerStyles(library, styles);
  return { ok: true, registered: counts };
});

registerHandler('get_registered_styles', async (params) => {
  const library = params.library as string;
  const styles = await getRegisteredStylesSummary(library);
  return styles ?? { textStyles: [], paintStyles: [], effectStyles: [] };
});

registerHandler('register_library_styles_incremental', async (params) => {
  const library = params.library as string;
  const fullStyles = params.fullStyles as RegisteredStyles;
  const changedStyles = params.changedStyles as RegisteredStyles;
  const removedKeys = (params.removedKeys as string[]) ?? [];
  const counts = await registerStylesIncremental(library, fullStyles, changedStyles, removedKeys);
  return { ok: true, registered: counts };
});

} // registerStyleHandlers

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
        base.color = figmaRgbaToHex({ ...(p as SolidPaint).color, a: 1 });
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
