/**
 * DTCG Token → Figma Variable mapper.
 *
 * Handles type conversion, scope inference, and collection/mode management.
 */

import type { DesignToken } from '../../shared/types.js';
import { hexToFigmaRgba } from '../utils/color.js';

/** Figma variable resolved type for a given DTCG type. */
export function dtcgTypeToFigmaType(
  dtcgType: string,
): 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN' {
  switch (dtcgType) {
    case 'color':
      return 'COLOR';
    case 'dimension':
    case 'number':
    case 'fontWeight':
    case 'duration':
      return 'FLOAT';
    case 'fontFamily':
    case 'string':
      return 'STRING';
    case 'boolean':
      return 'BOOLEAN';
    default:
      return 'STRING';
  }
}

/** Convert a DTCG value to a Figma-compatible value. */
export function dtcgValueToFigma(
  value: unknown,
  dtcgType: string,
): VariableValue {
  switch (dtcgType) {
    case 'color': {
      if (typeof value === 'string') {
        return hexToFigmaRgba(value);
      }
      return value as VariableValue;
    }
    case 'dimension': {
      if (typeof value === 'string') {
        return parseFloat(value.replace(/px|rem|em|%/g, ''));
      }
      return typeof value === 'number' ? value : 0;
    }
    case 'number':
    case 'fontWeight':
    case 'duration':
      return typeof value === 'number' ? value : parseFloat(String(value)) || 0;
    case 'fontFamily':
      return String(value);
    case 'boolean':
      return Boolean(value);
    default:
      return String(value);
  }
}

/** Infer Figma variable scopes from the token path. */
export function inferScopes(path: string, dtcgType: string): VariableScope[] {
  const lower = path.toLowerCase();

  if (dtcgType === 'color') {
    if (lower.includes('fill') || lower.includes('background') || lower.includes('surface')) {
      return ['ALL_FILLS'];
    }
    if (lower.includes('stroke') || lower.includes('border')) {
      return ['STROKE_COLOR'];
    }
    if (lower.includes('text') || lower.includes('font')) {
      return ['FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL'];
    }
    return ['ALL_FILLS', 'STROKE_COLOR', 'EFFECT_COLOR'];
  }

  if (dtcgType === 'dimension' || dtcgType === 'number') {
    if (lower.includes('radius') || lower.includes('corner')) {
      return ['CORNER_RADIUS'];
    }
    if (lower.includes('gap') || lower.includes('spacing')) {
      return ['GAP'];
    }
    if (lower.includes('padding')) {
      return ['ALL_SCOPES']; // no padding-specific scope; ALL_SCOPES allows binding to padding fields
    }
    if (lower.includes('size') || lower.includes('width') || lower.includes('height')) {
      return ['WIDTH_HEIGHT'];
    }
    if (lower.includes('font-size') || lower.includes('fontsize')) {
      return ['FONT_SIZE'];
    }
    if (lower.includes('line-height')) {
      return ['LINE_HEIGHT'];
    }
    if (lower.includes('letter-spacing')) {
      return ['LETTER_SPACING'];
    }
    if (lower.includes('opacity')) {
      return ['OPACITY'];
    }
  }

  if (dtcgType === 'fontFamily') {
    return ['FONT_FAMILY'];
  }

  if (dtcgType === 'fontWeight') {
    return ['FONT_WEIGHT'];
  }

  return ['ALL_SCOPES'];
}

/** Convert DTCG dot-path to Figma variable name (slash-separated groups). */
export function tokenPathToVariableName(path: string): string {
  return path.replace(/\./g, '/');
}

/** Create or update a Figma variable from a DTCG token. */
export async function syncTokenToVariable(
  token: DesignToken,
  collection: VariableCollection,
  modeId: string,
  existingVariables: Map<string, Variable>,
): Promise<{ action: 'created' | 'updated' | 'skipped'; variable: Variable }> {
  const varName = tokenPathToVariableName(token.path);
  const figmaType = dtcgTypeToFigmaType(token.type);
  const figmaValue = dtcgValueToFigma(token.value, token.type);

  const existing = existingVariables.get(varName);

  if (existing) {
    // Check if value changed
    const currentValue = existing.valuesByMode[modeId];
    if (valuesEqual(currentValue, figmaValue)) {
      return { action: 'skipped', variable: existing };
    }

    existing.setValueForMode(modeId, figmaValue);
    if (token.description && existing.description !== token.description) {
      existing.description = token.description;
    }
    return { action: 'updated', variable: existing };
  }

  // Create new variable
  const variable = figma.variables.createVariable(varName, collection, figmaType);
  variable.setValueForMode(modeId, figmaValue);
  if (token.description) {
    variable.description = token.description;
  }

  const scopes = inferScopes(token.path, token.type);
  variable.scopes = scopes;

  return { action: 'created', variable };
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a === 'object' && a !== null && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}
