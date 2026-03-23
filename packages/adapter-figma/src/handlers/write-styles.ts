/**
 * Styles write handlers — sync typography/shadow tokens to Figma Styles.
 */

import { registerHandler } from '../registry.js';
import type { DesignToken } from '@figcraft/shared';
import { syncTypographyToStyle, syncShadowToStyle } from '../adapters/style-mapper.js';
import { hexToFigmaRgba } from '../utils/color.js';
import { processBatch } from '../utils/batch.js';

export function registerWriteStyleHandlers(): void {

registerHandler('sync_styles', async (params) => {
  const tokens = params.tokens as DesignToken[];

  // Separate typography and shadow tokens
  const typographyTokens = tokens.filter((t) => t.type === 'typography');
  const shadowTokens = tokens.filter((t) => t.type === 'shadow');

  // Build existing style maps
  const existingTextStyles = new Map<string, TextStyle>();
  const textStyles = await figma.getLocalTextStylesAsync();
  for (const s of textStyles) {
    existingTextStyles.set(s.name, s);
  }

  const existingEffectStyles = new Map<string, EffectStyle>();
  const effectStyles = await figma.getLocalEffectStylesAsync();
  for (const s of effectStyles) {
    existingEffectStyles.set(s.name, s);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const failures: Array<{ path: string; error: string }> = [];

  // Sync typography
  const typoResult = await processBatch(typographyTokens, async (token) => {
    const result = await syncTypographyToStyle(token, existingTextStyles);
    switch (result.action) {
      case 'created': created++; break;
      case 'updated': updated++; break;
      case 'skipped': skipped++; break;
    }
  });

  for (const r of typoResult.results) {
    if (!r.ok) {
      failures.push({ path: (r.item as DesignToken).path, error: r.error ?? 'Unknown error' });
    }
  }

  // Sync shadows
  const shadowResult = await processBatch(shadowTokens, async (token) => {
    const result = await syncShadowToStyle(token, existingEffectStyles);
    switch (result.action) {
      case 'created': created++; break;
      case 'updated': updated++; break;
      case 'skipped': skipped++; break;
    }
  });

  for (const r of shadowResult.results) {
    if (!r.ok) {
      failures.push({ path: (r.item as DesignToken).path, error: r.error ?? 'Unknown error' });
    }
  }

  return {
    created,
    updated,
    skipped,
    failed: typoResult.failed + shadowResult.failed,
    failures,
  };
});

registerHandler('create_paint_style', async (params) => {
  const name = params.name as string;
  const color = params.color as string;
  const description = params.description as string | undefined;

  const style = figma.createPaintStyle();
  style.name = name;
  style.paints = [{ type: 'SOLID', color: hexToFigmaRgba(color) }];
  if (description) style.description = description;

  return { id: style.id, name: style.name };
});

registerHandler('delete_style', async (params) => {
  const styleId = params.styleId as string;
  const style = figma.getStyleById(styleId);
  if (!style) return { error: `Style not found: ${styleId}` };
  style.remove();
  return { ok: true };
});

registerHandler('update_paint_style', async (params) => {
  const styleId = params.styleId as string;
  const style = figma.getStyleById(styleId);
  if (!style || style.type !== 'PAINT') return { error: `Paint style not found: ${styleId}` };
  const ps = style as PaintStyle;
  if (params.name) ps.name = params.name as string;
  if (params.description !== undefined) ps.description = params.description as string;
  if (params.color && typeof params.color === 'string') {
    ps.paints = [{ type: 'SOLID', color: hexToFigmaRgba(params.color as string) }];
  }
  return { id: ps.id, name: ps.name };
});

registerHandler('update_text_style', async (params) => {
  const styleId = params.styleId as string;
  const style = figma.getStyleById(styleId);
  if (!style || style.type !== 'TEXT') return { error: `Text style not found: ${styleId}` };
  const ts = style as TextStyle;
  if (params.name) ts.name = params.name as string;
  if (params.description !== undefined) ts.description = params.description as string;
  if (params.fontFamily || params.fontStyle) {
    const family = (params.fontFamily as string) ?? ts.fontName.family;
    const fStyle = (params.fontStyle as string) ?? ts.fontName.style;
    await figma.loadFontAsync({ family, style: fStyle });
    ts.fontName = { family, style: fStyle };
  }
  if (params.fontSize != null) ts.fontSize = params.fontSize as number;
  if (params.lineHeight != null) {
    const lh = params.lineHeight;
    if (typeof lh === 'number') {
      ts.lineHeight = { value: lh, unit: 'PIXELS' };
    } else if (typeof lh === 'string' && lh === 'AUTO') {
      ts.lineHeight = { unit: 'AUTO' };
    } else {
      ts.lineHeight = lh as LineHeight;
    }
  }
  if (params.letterSpacing != null) {
    const ls = params.letterSpacing;
    if (typeof ls === 'number') {
      ts.letterSpacing = { value: ls, unit: 'PIXELS' };
    } else {
      ts.letterSpacing = ls as LetterSpacing;
    }
  }
  return { id: ts.id, name: ts.name, fontSize: ts.fontSize };
});

registerHandler('update_effect_style', async (params) => {
  const styleId = params.styleId as string;
  const style = figma.getStyleById(styleId);
  if (!style || style.type !== 'EFFECT') return { error: `Effect style not found: ${styleId}` };
  const es = style as EffectStyle;
  if (params.name) es.name = params.name as string;
  if (params.description !== undefined) es.description = params.description as string;
  if (params.effects) {
    es.effects = params.effects as Effect[];
  }
  return { id: es.id, name: es.name };
});

} // registerWriteStyleHandlers
