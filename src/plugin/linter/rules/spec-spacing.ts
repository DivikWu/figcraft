/**
 * Spec spacing rule — detect non-token spacing values.
 */

import type { AbstractNode, LintContext, LintViolation, LintRule } from '../types.js';

export const specSpacingRule: LintRule = {
  name: 'spec-spacing',
  description: 'Detect spacing values (padding, gap) not matching any spacing token.',
  category: 'token',
  severity: 'error',

  check(node: AbstractNode, ctx: LintContext): LintViolation[] {
    if (ctx.spacingTokens.size === 0) return [];

    const violations: LintViolation[] = [];

    const spacingProps: Array<{ key: string; value: number | undefined }> = [
      { key: 'itemSpacing', value: node.itemSpacing },
      { key: 'paddingLeft', value: node.paddingLeft },
      { key: 'paddingRight', value: node.paddingRight },
      { key: 'paddingTop', value: node.paddingTop },
      { key: 'paddingBottom', value: node.paddingBottom },
    ];

    for (const { key, value } of spacingProps) {
      if (value === undefined || value === 0) continue;

      // Check if bound to variable
      if (node.boundVariables?.[key]) continue;

      const match = findClosestSpacingToken(value, ctx.spacingTokens);
      if (match && match.tokenValue !== value) {
        violations.push({
          nodeId: node.id,
          nodeName: node.name,
          rule: 'spec-spacing',
          severity: 'error',
          currentValue: `${key}: ${value}`,
          expectedValue: `${match.tokenName}: ${match.tokenValue}`,
          suggestion: `Use spacing token "${match.tokenName}" (${match.tokenValue}) instead of ${value}`,
          autoFixable: true,
          fixData: {
            property: key,
            tokenName: match.tokenName,
            value: match.tokenValue,
            variableId: ctx.variableIds.get(match.tokenName),
          },
        });
      }
    }

    return violations;
  },
};

function findClosestSpacingToken(
  value: number,
  tokens: Map<string, number>,
): { tokenName: string; tokenValue: number } | null {
  // Exact match
  for (const [name, tv] of tokens) {
    if (tv === value) return { tokenName: name, tokenValue: tv };
  }

  // Find closest within 20% threshold
  let closest: { tokenName: string; tokenValue: number; diff: number } | null = null;
  for (const [name, tv] of tokens) {
    const diff = Math.abs(tv - value);
    if (diff / Math.max(value, 1) < 0.2 && (!closest || diff < closest.diff)) {
      closest = { tokenName: name, tokenValue: tv, diff };
    }
  }

  return closest ? { tokenName: closest.tokenName, tokenValue: closest.tokenValue } : null;
}
