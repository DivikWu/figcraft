/**
 * Tests for color conversion utilities.
 */

import { describe, expect, it } from 'vitest';
import {
  colorsEqual,
  contrastRatio,
  figmaRgbaToHex,
  hexContrastRatio,
  hexToFigmaRgb,
  hexToFigmaRgba,
  hexToRgbTuple,
  relativeLuminance,
} from '../../packages/adapter-figma/src/utils/color.js';

describe('hexToFigmaRgba', () => {
  it('converts 6-digit hex', () => {
    const c = hexToFigmaRgba('#FF0000');
    expect(c.r).toBeCloseTo(1);
    expect(c.g).toBeCloseTo(0);
    expect(c.b).toBeCloseTo(0);
    expect(c.a).toBe(1);
  });

  it('converts 8-digit hex with alpha', () => {
    const c = hexToFigmaRgba('#FF000080');
    expect(c.r).toBeCloseTo(1);
    expect(c.a).toBeCloseTo(128 / 255, 2);
  });

  it('handles lowercase hex', () => {
    const c = hexToFigmaRgba('#ff8800');
    expect(c.r).toBeCloseTo(1);
    expect(c.g).toBeCloseTo(0x88 / 255, 2);
  });

  it('handles hex without #', () => {
    const c = hexToFigmaRgba('00FF00');
    expect(c.g).toBeCloseTo(1);
  });
});

describe('hexToFigmaRgb', () => {
  it('returns RGB without alpha', () => {
    const c = hexToFigmaRgb('#0000FF');
    expect(c).toEqual({ r: 0, g: 0, b: 1 });
    expect('a' in c).toBe(false);
  });
});

describe('figmaRgbaToHex', () => {
  it('converts RGB to hex', () => {
    expect(figmaRgbaToHex({ r: 1, g: 0, b: 0 })).toBe('#ff0000');
  });

  it('converts RGBA with alpha', () => {
    const hex = figmaRgbaToHex({ r: 1, g: 0, b: 0, a: 0.5 });
    expect(hex).toBe('#ff000080');
  });

  it('omits alpha when opaque', () => {
    const hex = figmaRgbaToHex({ r: 0, g: 1, b: 0, a: 1 });
    expect(hex).toBe('#00ff00');
  });

  it('round-trips correctly', () => {
    const original = '#3366cc';
    const rgba = hexToFigmaRgba(original);
    const back = figmaRgbaToHex(rgba);
    expect(back).toBe(original);
  });
});

describe('relativeLuminance', () => {
  it('white has luminance ~1', () => {
    expect(relativeLuminance({ r: 1, g: 1, b: 1 })).toBeCloseTo(1, 2);
  });

  it('black has luminance ~0', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 2);
  });
});

describe('contrastRatio', () => {
  it('black vs white is 21:1', () => {
    const ratio = contrastRatio({ r: 0, g: 0, b: 0 }, { r: 1, g: 1, b: 1 });
    expect(ratio).toBeCloseTo(21, 0);
  });

  it('same color is 1:1', () => {
    const ratio = contrastRatio({ r: 0.5, g: 0.5, b: 0.5 }, { r: 0.5, g: 0.5, b: 0.5 });
    expect(ratio).toBeCloseTo(1, 2);
  });
});

describe('colorsEqual', () => {
  it('matches same color case-insensitive', () => {
    expect(colorsEqual('#FF0000', '#ff0000')).toBe(true);
  });

  it('matches with/without #', () => {
    expect(colorsEqual('#FF0000', 'FF0000')).toBe(true);
  });

  it('rejects different colors', () => {
    expect(colorsEqual('#FF0000', '#00FF00')).toBe(false);
  });
});

describe('hexContrastRatio', () => {
  it('calculates contrast between hex colors', () => {
    const ratio = hexContrastRatio('#000000', '#FFFFFF');
    expect(ratio).toBeCloseTo(21, 0);
  });
});

describe('hexToRgbTuple', () => {
  it('parses valid hex', () => {
    expect(hexToRgbTuple('#FF8000')).toEqual([1, expect.closeTo(0x80 / 255, 2), 0]);
  });

  it('returns null for short hex', () => {
    expect(hexToRgbTuple('#FFF')).toBeNull();
  });
});
