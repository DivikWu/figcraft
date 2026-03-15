/**
 * Styles write handlers — sync typography/shadow tokens to Figma Styles.
 */

import { registerHandler } from '../code.js';
import type { DesignToken } from '../../shared/types.js';
import { syncTypographyToStyle, syncShadowToStyle } from '../adapters/style-mapper.js';
import { hexToFigmaRgba } from '../utils/color.js';
import { processBatch } from '../utils/batch.js';

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
