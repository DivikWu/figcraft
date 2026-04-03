/**
 * Tests for buildTokenContext helper in lint tools.
 */

import { describe, expect, it } from 'vitest';
import { buildTokenContext } from '../../packages/core-mcp/src/tools/lint.js';

describe('buildTokenContext', () => {
  it('categorizes color tokens', () => {
    const ctx = buildTokenContext([
      { path: 'color.brand.primary', type: 'color', value: '#0066ff' },
      { path: 'color.neutral.white', type: 'color', value: '#ffffff' },
    ]) as { colorTokens: Record<string, string> };
    expect(ctx.colorTokens['color/brand/primary']).toBe('#0066ff');
    expect(ctx.colorTokens['color/neutral/white']).toBe('#ffffff');
  });

  it('categorizes spacing tokens by path', () => {
    const ctx = buildTokenContext([
      { path: 'spacing.sm', type: 'dimension', value: 8 },
      { path: 'padding.md', type: 'dimension', value: 16 },
      { path: 'gap.lg', type: 'number', value: 24 },
    ]) as { spacingTokens: Record<string, number> };
    expect(ctx.spacingTokens['spacing/sm']).toBe(8);
    expect(ctx.spacingTokens['padding/md']).toBe(16);
    expect(ctx.spacingTokens['gap/lg']).toBe(24);
  });

  it('categorizes radius tokens by path', () => {
    const ctx = buildTokenContext([
      { path: 'border-radius.md', type: 'dimension', value: 8 },
      { path: 'corner.lg', type: 'dimension', value: 16 },
    ]) as { radiusTokens: Record<string, number> };
    expect(ctx.radiusTokens['border-radius/md']).toBe(8);
    expect(ctx.radiusTokens['corner/lg']).toBe(16);
  });

  it('categorizes typography tokens', () => {
    const typoValue = { fontSize: 16, fontFamily: 'Inter', fontWeight: '400' };
    const ctx = buildTokenContext([{ path: 'typography.body', type: 'typography', value: typoValue }]) as {
      typographyTokens: Record<string, unknown>;
    };
    expect(ctx.typographyTokens['typography/body']).toEqual(typoValue);
  });

  it('converts dot paths to slash paths', () => {
    const ctx = buildTokenContext([{ path: 'color.brand.primary', type: 'color', value: '#ff0000' }]) as {
      colorTokens: Record<string, string>;
    };
    expect('color/brand/primary' in ctx.colorTokens).toBe(true);
  });

  it('parses string dimension values', () => {
    const ctx = buildTokenContext([{ path: 'spacing.base', type: 'dimension', value: '16' }]) as {
      spacingTokens: Record<string, number>;
    };
    expect(ctx.spacingTokens['spacing/base']).toBe(16);
  });

  it('always includes empty variableIds', () => {
    const ctx = buildTokenContext([]) as { variableIds: Record<string, string> };
    expect(ctx.variableIds).toEqual({});
  });

  it('ignores non-string color values', () => {
    const ctx = buildTokenContext([{ path: 'color.weird', type: 'color', value: 123 }]) as {
      colorTokens: Record<string, string>;
    };
    expect(Object.keys(ctx.colorTokens)).toHaveLength(0);
  });

  it('dimension without spacing/radius keywords is ignored', () => {
    const ctx = buildTokenContext([{ path: 'size.icon', type: 'dimension', value: 24 }]) as {
      spacingTokens: Record<string, number>;
      radiusTokens: Record<string, number>;
    };
    expect(Object.keys(ctx.spacingTokens)).toHaveLength(0);
    expect(Object.keys(ctx.radiusTokens)).toHaveLength(0);
  });
});
