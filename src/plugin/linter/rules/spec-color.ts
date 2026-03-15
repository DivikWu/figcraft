/**
 * Spec color rule — detect hardcoded colors not matching any token.
 */

import type { AbstractNode, LintContext, LintViolation, LintRule } from '../types.js';

export const specColorRule: LintRule = {
  name: 'spec-color',
  description: 'Detect hardcoded colors that should use a design token variable.',

  check(node: AbstractNode, ctx: LintContext): LintViolation[] {
    const violations: LintViolation[] = [];

    // Skip if already bound to a variable
    if (node.boundVariables && Object.keys(node.boundVariables).length > 0) {
      return violations;
    }

    // Check fills
    if (node.fills && !node.fillStyleId) {
      for (const fill of node.fills) {
        if (fill.type === 'SOLID' && fill.color && fill.visible !== false) {
          const hex = fill.color.toLowerCase();
          const match = findClosestToken(hex, ctx.colorTokens);
          if (match) {
            violations.push({
              nodeId: node.id,
              nodeName: node.name,
              rule: 'spec-color',
              currentValue: hex,
              expectedValue: match.tokenValue,
              suggestion: `Use token "${match.tokenName}" (${match.tokenValue}) instead of hardcoded ${hex}`,
              autoFixable: true,
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
    if (node.strokes) {
      for (const stroke of node.strokes) {
        if (stroke.type === 'SOLID' && stroke.color && stroke.visible !== false) {
          const hex = stroke.color.toLowerCase();
          const match = findClosestToken(hex, ctx.colorTokens);
          if (match) {
            violations.push({
              nodeId: node.id,
              nodeName: node.name,
              rule: 'spec-color',
              currentValue: hex,
              expectedValue: match.tokenValue,
              suggestion: `Use token "${match.tokenName}" for stroke instead of ${hex}`,
              autoFixable: true,
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
};

function findClosestToken(
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
    if (dist < 10 && (!closest || dist < closest.distance)) {
      closest = { tokenName: name, tokenValue: value, distance: dist };
    }
  }

  return closest ? { tokenName: closest.tokenName, tokenValue: closest.tokenValue } : null;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.replace('#', '');
  if (clean.length < 6) return null;
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt(
    Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2) + Math.pow(a[2] - b[2], 2),
  );
}
