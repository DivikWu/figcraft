/**
 * Spec color rule — detect hardcoded colors not matching any token.
 */

import type { AbstractNode, FixDescriptor, LintContext, LintRule, LintViolation } from '../../types.js';
import { tr } from '../../types.js';

export const specColorRule: LintRule = {
  name: 'spec-color',
  description: "Detect colors that don't match any design token — suggests the closest token to use.",
  category: 'token',
  severity: 'error',
  ai: {
    preventionHint:
      'Use fillVariableName or strokeVariableName to bind colors to design tokens instead of hardcoding hex values',
    phase: ['styling'],
    tags: ['color'],
  },

  check(node: AbstractNode, ctx: LintContext): LintViolation[] {
    const violations: LintViolation[] = [];

    // Descendants of COMPONENT/INSTANCE: spec compliance is the component
    // author's concern. Consumers only interact at the instance boundary.
    if (node.insideComponentSubtree) return violations;

    // Presentational containers are display scaffolding — skip token checks
    if (node.role === 'presentation') return violations;

    // Skip if node-level bindings exist (fills/strokes/cornerRadius bound here).
    // Per-paint bindings (fill.boundVariables.color) are handled per-fill below —
    // a node can have one bound fill and one hardcoded fill.
    if (node.boundVariables && Object.keys(node.boundVariables).length > 0) {
      return violations;
    }

    // Check fills
    if (node.fills && !node.fillStyleId) {
      for (const fill of node.fills) {
        // Skip per-paint bound fills — the color is a variable reference, not a hex.
        if (fill.boundVariables?.color) continue;
        if (fill.type === 'SOLID' && fill.color && fill.visible !== false) {
          const hex = fill.color.toLowerCase();
          const match = findClosestToken(hex, ctx.colorTokens);
          if (match) {
            violations.push({
              nodeId: node.id,
              nodeName: node.name,
              rule: 'spec-color',
              severity: 'error',
              currentValue: hex,
              expectedValue: match.tokenValue,
              suggestion: tr(
                ctx.lang,
                `"${node.name}" uses ${hex} — switch to token "${match.tokenName}" (${match.tokenValue}) instead`,
                `「${node.name}」使用了 ${hex}——建议切换到 Token「${match.tokenName}」(${match.tokenValue})`,
              ),
              autoFixable: !!ctx.variableIds.get(match.tokenName),
              fixData: {
                property: 'fills',
                tokenName: match.tokenName,
                variableId: ctx.variableIds.get(match.tokenName),
              },
            });
          }
        }
      }
    }

    // Check strokes
    if (node.strokes && !node.strokeStyleId) {
      for (const stroke of node.strokes) {
        if (stroke.type === 'SOLID' && stroke.color && stroke.visible !== false) {
          const hex = stroke.color.toLowerCase();
          const match = findClosestToken(hex, ctx.colorTokens);
          if (match) {
            violations.push({
              nodeId: node.id,
              nodeName: node.name,
              rule: 'spec-color',
              severity: 'error',
              currentValue: hex,
              expectedValue: match.tokenValue,
              suggestion: tr(
                ctx.lang,
                `"${node.name}" stroke uses ${hex} — switch to token "${match.tokenName}" instead`,
                `「${node.name}」描边使用了 ${hex}——建议切换到 Token「${match.tokenName}」`,
              ),
              autoFixable: !!ctx.variableIds.get(match.tokenName),
              fixData: {
                property: 'strokes',
                tokenName: match.tokenName,
                variableId: ctx.variableIds.get(match.tokenName),
              },
            });
          }
        }
      }
    }

    return violations;
  },

  describeFix(v): FixDescriptor | null {
    if (!v.fixData) return null;
    // If we have a variableId, the plugin can bind directly without library search
    if (v.fixData.variableId) {
      return {
        kind: 'deferred',
        strategy: 'bind-variable-to-paint',
        data: {
          property: v.fixData.property,
          variableId: v.fixData.variableId,
        },
      };
    }
    return null;
  },
};

export function findClosestToken(
  hex: string,
  tokens: Map<string, string>,
): { tokenName: string; tokenValue: string } | null {
  // Exact match first
  for (const [name, value] of tokens) {
    if (value.toLowerCase() === hex) {
      return { tokenName: name, tokenValue: value };
    }
  }

  // Close match (within small delta)
  const rgb = hexToRgb(hex);
  if (!rgb) return null;

  let closest: { tokenName: string; tokenValue: string; distance: number } | null = null;

  for (const [name, value] of tokens) {
    const tRgb = hexToRgb(value);
    if (!tRgb) continue;
    const dist = colorDistance(rgb, tRgb);
    if (dist < 5 && (!closest || dist < closest.distance)) {
      closest = { tokenName: name, tokenValue: value, distance: dist };
    }
  }

  return closest ? { tokenName: closest.tokenName, tokenValue: closest.tokenValue } : null;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.replace('#', '');
  if (clean.length < 6) return null;
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}
