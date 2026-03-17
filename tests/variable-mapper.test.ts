/**
 * Tests for variable-mapper — type conversion, scope inference, path conversion.
 */

import { describe, it, expect } from 'vitest';
import {
  dtcgTypeToFigmaType,
  inferScopes,
  tokenPathToVariableName,
} from '../src/plugin/adapters/variable-mapper.js';

describe('dtcgTypeToFigmaType', () => {
  it('maps color → COLOR', () => {
    expect(dtcgTypeToFigmaType('color')).toBe('COLOR');
  });

  it('maps dimension → FLOAT', () => {
    expect(dtcgTypeToFigmaType('dimension')).toBe('FLOAT');
  });

  it('maps number → FLOAT', () => {
    expect(dtcgTypeToFigmaType('number')).toBe('FLOAT');
  });

  it('maps fontWeight → FLOAT', () => {
    expect(dtcgTypeToFigmaType('fontWeight')).toBe('FLOAT');
  });

  it('maps fontFamily → STRING', () => {
    expect(dtcgTypeToFigmaType('fontFamily')).toBe('STRING');
  });

  it('maps boolean → BOOLEAN', () => {
    expect(dtcgTypeToFigmaType('boolean')).toBe('BOOLEAN');
  });

  it('maps unknown type → STRING', () => {
    expect(dtcgTypeToFigmaType('whatever')).toBe('STRING');
  });
});

describe('inferScopes', () => {
  it('infers ALL_FILLS for background color', () => {
    expect(inferScopes('color.background.primary', 'color')).toEqual(['ALL_FILLS']);
  });

  it('infers STROKE_COLOR for border color', () => {
    expect(inferScopes('color.border.default', 'color')).toEqual(['STROKE_COLOR']);
  });

  it('infers text fill scopes for text color', () => {
    expect(inferScopes('color.text.primary', 'color')).toEqual(['FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL']);
  });

  it('infers CORNER_RADIUS for radius dimension', () => {
    expect(inferScopes('border-radius.md', 'dimension')).toEqual(['CORNER_RADIUS']);
  });

  it('infers GAP for spacing dimension', () => {
    expect(inferScopes('spacing.md', 'dimension')).toEqual(['GAP']);
  });

  it('infers FONT_SIZE for font-size', () => {
    expect(inferScopes('font-size.body', 'dimension')).toEqual(['FONT_SIZE']);
  });

  it('infers FONT_FAMILY for fontFamily type', () => {
    expect(inferScopes('font.body', 'fontFamily')).toEqual(['FONT_FAMILY']);
  });

  it('defaults to ALL_SCOPES for generic color', () => {
    const scopes = inferScopes('color.brand.primary', 'color');
    expect(scopes).toEqual(['ALL_FILLS', 'STROKE_COLOR', 'EFFECT_COLOR']);
  });
});

describe('tokenPathToVariableName', () => {
  it('converts dots to slashes', () => {
    expect(tokenPathToVariableName('color.brand.primary')).toBe('color/brand/primary');
  });

  it('handles single segment', () => {
    expect(tokenPathToVariableName('red')).toBe('red');
  });
});
