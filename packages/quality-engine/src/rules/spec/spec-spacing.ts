/**
 * Spec spacing rule — detect non-token spacing values.
 */

import type { AbstractNode, FixDescriptor, LintContext, LintRule, LintViolation } from '../../types.js';

export const specSpacingRule: LintRule = {
  name: 'spec-spacing',
  description: "Detect padding or gap values that don't match any spacing token.",
  category: 'token',
  severity: 'error',
  ai: {
    preventionHint: 'Use spacing token variables for padding and itemSpacing instead of arbitrary values',
    phase: ['styling'],
    tags: ['frame'],
  },

  check(node: AbstractNode, ctx: LintContext): LintViolation[] {
    if (ctx.spacingTokens.size === 0) return [];
    if (node.role === 'presentation') return [];

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
          suggestion: `"${node.name}" ${key} is ${value}px — use spacing token "${match.tokenName}" (${match.tokenValue}px) instead`,
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

  describeFix(v): FixDescriptor | null {
    if (!v.fixData || v.fixData.value == null || !v.fixData.property) return null;
    // Prefer deferred strategy for token binding when variableId is available
    if (v.fixData.variableId) {
      return {
        kind: 'deferred',
        strategy: 'library-spacing-bind',
        data: { property: v.fixData.property, value: v.fixData.value, variableId: v.fixData.variableId },
      };
    }
    return { kind: 'set-properties', props: { [v.fixData.property as string]: v.fixData.value } };
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
