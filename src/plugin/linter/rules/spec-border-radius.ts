/**
 * Spec border radius rule — detect non-token corner radius values.
 */

import type { AbstractNode, LintContext, LintViolation, LintRule } from '../types.js';

export const specBorderRadiusRule: LintRule = {
  name: 'spec-border-radius',
  description: 'Detect corner radius values not matching any radius token.',

  check(node: AbstractNode, ctx: LintContext): LintViolation[] {
    if (ctx.radiusTokens.size === 0) return [];
    if (node.cornerRadius === undefined) return [];
    if (node.boundVariables?.['cornerRadius']) return [];

    const violations: LintViolation[] = [];

    const radii = typeof node.cornerRadius === 'number'
      ? [node.cornerRadius]
      : node.cornerRadius;

    for (const radius of radii) {
      if (radius === 0) continue;

      // Check if value matches any token
      let matched = false;
      for (const [, tv] of ctx.radiusTokens) {
        if (tv === radius) { matched = true; break; }
      }

      if (!matched) {
        const closest = findClosestRadiusToken(radius, ctx.radiusTokens);
        if (closest) {
          violations.push({
            nodeId: node.id,
            nodeName: node.name,
            rule: 'spec-border-radius',
            currentValue: radius,
            expectedValue: `${closest.tokenName}: ${closest.tokenValue}`,
            suggestion: `Use radius token "${closest.tokenName}" (${closest.tokenValue}) instead of ${radius}`,
            autoFixable: true,
            fixData: {
              tokenName: closest.tokenName,
              value: closest.tokenValue,
              variableId: ctx.variableIds.get(closest.tokenName),
            },
          });
        }
      }
    }

    return violations;
  },
};

function findClosestRadiusToken(
  value: number,
  tokens: Map<string, number>,
): { tokenName: string; tokenValue: number } | null {
  let closest: { tokenName: string; tokenValue: number; diff: number } | null = null;
  for (const [name, tv] of tokens) {
    const diff = Math.abs(tv - value);
    if (!closest || diff < closest.diff) {
      closest = { tokenName: name, tokenValue: tv, diff };
    }
  }
  return closest;
}
