/**
 * Scan handlers — scan styles usage, export tokens, diff styles.
 */

import { registerHandler } from '../registry.js';
import { figmaRgbaToHex } from '../utils/color.js';
import { isRgbaLike } from '../utils/type-guards.js';
import { assertHandler } from '../utils/handler-error.js';

export function registerScanHandlers(): void {

registerHandler('scan_styles', async () => {
  const paintStyles = await figma.getLocalPaintStylesAsync();
  const textStyles = await figma.getLocalTextStylesAsync();
  const effectStyles = await figma.getLocalEffectStylesAsync();

  return {
    paint: paintStyles.map((s) => ({
      id: s.id,
      name: s.name,
      paints: s.paints.length,
    })),
    text: textStyles.map((s) => ({
      id: s.id,
      name: s.name,
      fontSize: s.fontSize,
      fontName: s.fontName,
    })),
    effect: effectStyles.map((s) => ({
      id: s.id,
      name: s.name,
      effects: s.effects.length,
    })),
    summary: {
      paintCount: paintStyles.length,
      textCount: textStyles.length,
      effectCount: effectStyles.length,
    },
  };
});

registerHandler('export_tokens', async () => {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const result: Record<string, unknown> = {};

  for (const collection of collections) {
    const tokens: Record<string, unknown> = {};
    for (const varId of collection.variableIds) {
      const variable = await figma.variables.getVariableByIdAsync(varId);
      if (!variable) continue;

      const modeId = collection.modes[0].modeId;
      const rawValue = variable.valuesByMode[modeId];
      let value: unknown = rawValue;

      // Convert Figma color to hex
      if (variable.resolvedType === 'COLOR' && isRgbaLike(rawValue)) {
        value = figmaRgbaToHex(rawValue);
      }

      tokens[variable.name] = {
        $value: value,
        $type: figmaTypeToTokenType(variable.resolvedType),
        $description: variable.description || undefined,
      };
    }

    result[collection.name] = tokens;
  }

  return result;
});

registerHandler('diff_styles', async (params) => {
  const dtcgTokens = params.tokens as Array<{ path: string; type: string; value: unknown }> | undefined;
  assertHandler(dtcgTokens, 'No tokens provided for comparison');

  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const figmaVars = new Map<string, { value: unknown; type: string }>();

  for (const collection of collections) {
    for (const varId of collection.variableIds) {
      const variable = await figma.variables.getVariableByIdAsync(varId);
      if (!variable) continue;
      const modeId = collection.modes[0].modeId;
      let value: unknown = variable.valuesByMode[modeId];
      if (variable.resolvedType === 'COLOR' && isRgbaLike(value)) {
        value = figmaRgbaToHex(value);
      }
      figmaVars.set(variable.name, { value, type: variable.resolvedType });
    }
  }

  const diff: unknown[] = [];
  for (const token of dtcgTokens) {
    const varName = token.path.replace(/\./g, '/');
    const figmaVar = figmaVars.get(varName);
    if (!figmaVar) {
      diff.push({ path: token.path, status: 'missing-in-figma', dtcgValue: token.value });
    } else {
      const match = JSON.stringify(figmaVar.value) === JSON.stringify(token.value);
      diff.push({
        path: token.path,
        status: match ? 'in-sync' : 'value-mismatch',
        dtcgValue: token.value,
        figmaValue: figmaVar.value,
      });
      figmaVars.delete(varName);
    }
  }

  for (const [name, v] of figmaVars) {
    diff.push({ path: name, status: 'missing-in-dtcg', figmaValue: v.value });
  }

  return { diff, total: diff.length };
});

} // registerScanHandlers

function figmaTypeToTokenType(type: string): string {
  switch (type) {
    case 'COLOR': return 'color';
    case 'FLOAT': return 'number';
    case 'STRING': return 'string';
    case 'BOOLEAN': return 'boolean';
    default: return 'string';
  }
}
