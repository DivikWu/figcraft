/**
 * Foreign variable rule — detect nodes using variables (color, spacing, radius, etc.)
 * that don't belong to the currently selected library.
 *
 * Complements foreign-style (which checks fillStyleId/textStyleId/effectStyleId).
 * This rule checks variable bindings on fills, strokes, and node-level boundVariables.
 *
 * Only active in library mode when libraryVariableIds is populated.
 */

import type { AbstractNode, FixDescriptor, LintContext, LintRule, LintViolation } from '../../types.js';
import { tr } from '../../types.js';

/** Extract variable ID from a binding value (handles both {id: "..."} and {type, id} shapes). */
function extractVarId(binding: unknown): string | null {
  if (!binding || typeof binding !== 'object') return null;
  const obj = binding as Record<string, unknown>;
  if (typeof obj.id === 'string') return obj.id;
  return null;
}

/** Collect all bound variable IDs from a node's fills and strokes (per-paint bindings). */
function collectPaintVarIds(node: AbstractNode): Array<{ id: string; source: string }> {
  const result: Array<{ id: string; source: string }> = [];

  if (node.fills) {
    for (const fill of node.fills) {
      if (fill.visible === false) continue;
      const varId = fill.boundVariables?.color ? extractVarId(fill.boundVariables.color) : null;
      if (varId) result.push({ id: varId, source: 'fill' });
    }
  }

  if (node.strokes) {
    for (const stroke of node.strokes) {
      if (stroke.visible === false) continue;
      const varId = stroke.boundVariables?.color ? extractVarId(stroke.boundVariables.color) : null;
      if (varId) result.push({ id: varId, source: 'stroke' });
    }
  }

  return result;
}

/** Collect all bound variable IDs from node-level boundVariables (cornerRadius, padding, etc.). */
function collectNodeLevelVarIds(node: AbstractNode): Array<{ id: string; source: string }> {
  const result: Array<{ id: string; source: string }> = [];
  const bv = node.boundVariables;
  if (!bv || typeof bv !== 'object') return result;

  for (const [key, val] of Object.entries(bv)) {
    // Skip fills/strokes — handled by collectPaintVarIds via per-paint bindings.
    // Legacy node-level fills/strokes bindings are near-extinct in modern Figma.
    if (key === 'fills' || key === 'strokes') continue;

    if (Array.isArray(val)) {
      for (const item of val) {
        const varId = extractVarId(item);
        if (varId) result.push({ id: varId, source: key });
      }
    } else {
      const varId = extractVarId(val);
      if (varId) result.push({ id: varId, source: key });
    }
  }

  return result;
}

export const foreignVariableRule: LintRule = {
  name: 'foreign-variable',
  description: 'Detect variables (color, spacing, radius) bound from a different library than the one selected.',
  category: 'token',
  severity: 'heuristic',
  ai: {
    preventionHint:
      'Use fillVariableName/strokeVariableName with variables from the selected library — avoid binding variables from other libraries',
    phase: ['styling'],
    tags: ['color', 'radius', 'spacing'],
  },

  check(node: AbstractNode, ctx: LintContext): LintViolation[] {
    // Only active in library mode with a library selected and variable IDs populated
    if (ctx.mode !== 'library' || !ctx.selectedLibrary) return [];
    if (!ctx.libraryVariableIds || ctx.libraryVariableIds.size === 0) return [];

    // NOTE: Unlike hardcoded-token / spec-color, this rule does NOT skip
    // insideComponentSubtree. Cross-library variable references are a dependency
    // management issue that component authors need to see — regardless of
    // nesting depth. Value-compliance rules skip component internals (noise
    // from icon vectors etc.), but source-compliance rules should not.

    const violations: LintViolation[] = [];

    // Check per-paint variable bindings (fills, strokes) — modern Figma API format
    const paintVars = collectPaintVarIds(node);
    for (const { id, source } of paintVars) {
      if (!ctx.libraryVariableIds.has(id)) {
        const sourceLabel = source === 'fill' ? 'fill' : 'stroke';
        const isFill = source === 'fill';
        violations.push({
          nodeId: node.id,
          nodeName: node.name,
          rule: 'foreign-variable',
          severity: 'heuristic',
          currentValue: `${sourceLabel} variableId: ${id}`,
          suggestion: tr(
            ctx.lang,
            `"${node.name}" uses a ${sourceLabel} variable from a different library — rebind to a variable from "${ctx.selectedLibrary}"`,
            `「${node.name}」使用了其他库的${isFill ? '填充' : '描边'}变量——请改用「${ctx.selectedLibrary}」中的变量`,
          ),
          // Auto-fixable for both fill and stroke via library-color-bind
          autoFixable: true,
          fixData: isFill
            ? {
                property: 'fills',
                hex: node.fills?.find((f) => f.type === 'SOLID' && f.visible !== false)?.color ?? null,
                opacity: node.fills?.find((f) => f.type === 'SOLID' && f.visible !== false)?.opacity ?? 1,
                nodeType: node.type,
                clearBinding: true,
              }
            : {
                property: 'strokes',
                hex: node.strokes?.find((s) => s.type === 'SOLID' && s.visible !== false)?.color ?? null,
                opacity: node.strokes?.find((s) => s.type === 'SOLID' && s.visible !== false)?.opacity ?? 1,
                nodeType: node.type,
                clearBinding: true,
              },
        });
      }
    }

    // Check node-level variable bindings (cornerRadius, padding, spacing, etc.)
    const nodeVars = collectNodeLevelVarIds(node);
    for (const { id, source } of nodeVars) {
      if (!ctx.libraryVariableIds.has(id)) {
        violations.push({
          nodeId: node.id,
          nodeName: node.name,
          rule: 'foreign-variable',
          severity: 'heuristic',
          currentValue: `${source} variableId: ${id}`,
          suggestion: tr(
            ctx.lang,
            `"${node.name}" uses a ${source} variable from a different library — rebind to a variable from "${ctx.selectedLibrary}"`,
            `「${node.name}」的 ${source} 使用了其他库的变量——请改用「${ctx.selectedLibrary}」中的变量`,
          ),
          autoFixable: false,
          fixData: { property: source },
        });
      }
    }

    return violations;
  },

  describeFix(v): FixDescriptor | null {
    if (!v.fixData) return null;
    const prop = v.fixData.property as string;
    // Fill variable → rebind to library color variable
    if (prop === 'fills') {
      return {
        kind: 'deferred',
        strategy: 'library-color-bind',
        data: { property: 'fills', hex: v.fixData.hex, opacity: v.fixData.opacity, nodeType: v.fixData.nodeType },
      };
    }
    // Stroke variable → rebind to library color variable
    if (prop === 'strokes') {
      return {
        kind: 'deferred',
        strategy: 'library-color-bind',
        data: { property: 'strokes', hex: v.fixData.hex, opacity: v.fixData.opacity, nodeType: v.fixData.nodeType },
      };
    }
    return null;
  },
};
