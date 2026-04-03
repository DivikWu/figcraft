/**
 * Tests for Figma variable type guards.
 */

import { describe, expect, it } from 'vitest';
import { isRgbaLike, isVariableAlias } from '../../packages/adapter-figma/src/utils/type-guards.js';

describe('isVariableAlias', () => {
  it('returns true for valid VariableAlias', () => {
    expect(isVariableAlias({ type: 'VARIABLE_ALIAS', id: 'abc123' })).toBe(true);
  });

  it('returns false for wrong type field', () => {
    expect(isVariableAlias({ type: 'COLOR', id: 'abc123' })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isVariableAlias(null)).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isVariableAlias(42)).toBe(false);
    expect(isVariableAlias('string')).toBe(false);
    expect(isVariableAlias(undefined)).toBe(false);
  });

  it('returns false for object without type field', () => {
    expect(isVariableAlias({ id: 'abc123' })).toBe(false);
  });
});

describe('isRgbaLike', () => {
  it('returns true for RGBA object', () => {
    expect(isRgbaLike({ r: 1, g: 0.5, b: 0, a: 1 })).toBe(true);
  });

  it('returns true for RGB object (has r property)', () => {
    expect(isRgbaLike({ r: 0, g: 0, b: 0 })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isRgbaLike(null)).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isRgbaLike(42)).toBe(false);
    expect(isRgbaLike('red')).toBe(false);
  });

  it('returns false for object without r property', () => {
    expect(isRgbaLike({ g: 1, b: 1 })).toBe(false);
  });
});
