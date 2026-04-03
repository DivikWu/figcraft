/**
 * Tests for DTCG parser — flat token extraction, alias resolution, type inheritance.
 */

import { describe, expect, it } from 'vitest';
import { parseDtcg } from '../../packages/core-mcp/src/dtcg.js';

describe('parseDtcg', () => {
  it('parses a flat token', () => {
    const tokens = parseDtcg({
      red: { $value: '#FF0000', $type: 'color' },
    });
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      path: 'red',
      type: 'color',
      value: '#FF0000',
    });
  });

  it('parses nested groups with dot-path', () => {
    const tokens = parseDtcg({
      color: {
        brand: {
          primary: { $value: '#0066FF', $type: 'color' },
        },
      },
    });
    expect(tokens).toHaveLength(1);
    expect(tokens[0].path).toBe('color.brand.primary');
  });

  it('inherits $type from parent group', () => {
    const tokens = parseDtcg({
      color: {
        $type: 'color',
        red: { $value: '#FF0000' },
        blue: { $value: '#0000FF' },
      },
    });
    expect(tokens).toHaveLength(2);
    expect(tokens[0].type).toBe('color');
    expect(tokens[1].type).toBe('color');
  });

  it('token-level $type overrides group $type', () => {
    const tokens = parseDtcg({
      misc: {
        $type: 'color',
        size: { $value: '16px', $type: 'dimension' },
      },
    });
    expect(tokens[0].type).toBe('dimension');
  });

  it('resolves simple alias', () => {
    const tokens = parseDtcg({
      base: { $value: '#FF0000', $type: 'color' },
      alias: { $value: '{base}', $type: 'color' },
    });
    expect(tokens.find((t) => t.path === 'alias')!.value).toBe('#FF0000');
  });

  it('resolves chained aliases', () => {
    const tokens = parseDtcg({
      a: { $value: '8px', $type: 'dimension' },
      b: { $value: '{a}', $type: 'dimension' },
      c: { $value: '{b}', $type: 'dimension' },
    });
    expect(tokens.find((t) => t.path === 'c')!.value).toBe('8px');
  });

  it('handles circular alias gracefully', () => {
    const tokens = parseDtcg({
      a: { $value: '{b}', $type: 'color' },
      b: { $value: '{a}', $type: 'color' },
    });
    // Should not throw, returns unresolved alias string
    const aToken = tokens.find((t) => t.path === 'a')!;
    expect(typeof aToken.value).toBe('string');
  });

  it('preserves $description', () => {
    const tokens = parseDtcg({
      spacing: { $value: '16px', $type: 'dimension', $description: 'Base spacing unit' },
    });
    expect(tokens[0].description).toBe('Base spacing unit');
  });

  it('skips $-prefixed meta keys', () => {
    const tokens = parseDtcg({
      $type: 'color',
      $description: 'Root group',
      red: { $value: '#FF0000' },
    });
    expect(tokens).toHaveLength(1);
    expect(tokens[0].path).toBe('red');
  });

  it('resolves alias inside composite value', () => {
    const tokens = parseDtcg({
      base: { $value: '#000000', $type: 'color' },
      shadow: {
        $value: {
          color: '{base}',
          offsetX: '0px',
          offsetY: '4px',
          blur: '8px',
        },
        $type: 'shadow',
      },
    });
    const shadow = tokens.find((t) => t.path === 'shadow')!;
    expect((shadow.value as Record<string, unknown>).color).toBe('#000000');
  });

  it('handles empty input', () => {
    const tokens = parseDtcg({});
    expect(tokens).toHaveLength(0);
  });
});
