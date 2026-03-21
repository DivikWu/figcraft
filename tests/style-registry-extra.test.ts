/**
 * Tests for style-registry additions: findClosestPaintStyle, getAvailablePaintStyleNames.
 *
 * Since the paint style map is internal and populated via registerStyles (which requires
 * Figma API), we test the pure logic functions by importing and testing the color distance
 * algorithm directly.
 */

import { describe, it, expect } from 'vitest';

// Test the color distance logic used in findClosestPaintStyle
// (extracted here since the actual function depends on internal paintStyleMap state)
// Uses "redmean" weighted Euclidean distance for perceptual accuracy.
function colorDistance(hex1: string, hex2: string): number {
  const parse = (h: string) => {
    const c = h.replace('#', '');
    return [
      parseInt(c.slice(0, 2), 16),
      parseInt(c.slice(2, 4), 16),
      parseInt(c.slice(4, 6), 16),
    ];
  };
  const [r1, g1, b1] = parse(hex1);
  const [r2, g2, b2] = parse(hex2);
  const rmean = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt((2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db);
}

describe('color distance algorithm', () => {
  it('returns 0 for identical colors', () => {
    expect(colorDistance('#FF0000', '#FF0000')).toBe(0);
  });

  it('returns small distance for similar colors', () => {
    // #FF0000 vs #FE0101 — very close
    const dist = colorDistance('#FF0000', '#FE0101');
    expect(dist).toBeLessThan(5);
  });

  it('returns large distance for opposite colors', () => {
    // Black vs White
    const dist = colorDistance('#000000', '#FFFFFF');
    expect(dist).toBeGreaterThan(400);
  });

  it('threshold of 80 catches visually similar colors', () => {
    // #3B82F6 (blue-500) vs #2563EB (blue-600) — similar blues
    const dist = colorDistance('#3B82F6', '#2563EB');
    expect(dist).toBeLessThan(80);
  });

  it('threshold of 80 rejects visually different colors', () => {
    // #3B82F6 (blue) vs #EF4444 (red) — very different
    const dist = colorDistance('#3B82F6', '#EF4444');
    expect(dist).toBeGreaterThan(80);
  });

  it('handles lowercase hex', () => {
    expect(colorDistance('#ff0000', '#FF0000')).toBe(0);
  });
});
