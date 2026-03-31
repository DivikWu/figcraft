/**
 * Spec typography rule — detect text nodes not using a text style token.
 */

import type { AbstractNode, LintContext, LintViolation, LintRule } from '../../types.js';

export const specTypographyRule: LintRule = {
  name: 'spec-typography',
  description: 'Detect text layers with custom font settings that should use a typography token.',
  category: 'token',
  severity: 'error',

  check(node: AbstractNode, ctx: LintContext): LintViolation[] {
    if (node.type !== 'TEXT') return [];
    if (node.textStyleId) return []; // already using a style

    const violations: LintViolation[] = [];

    if (node.fontSize && ctx.typographyTokens.size > 0) {
      const match = findMatchingTypography(node, ctx);
      if (match) {
        violations.push({
          nodeId: node.id,
          nodeName: node.name,
          rule: 'spec-typography',
          severity: 'error',
          currentValue: {
            fontSize: node.fontSize,
            fontFamily: node.fontName?.family,
          },
          expectedValue: match.tokenName,
          suggestion: `"${node.name}" uses custom font settings — apply text style "${match.tokenName}" instead`,
          autoFixable: true,
          fixData: { tokenName: match.tokenName },
        });
      }
    }

    return violations;
  },
};

function findMatchingTypography(
  node: AbstractNode,
  ctx: LintContext,
): { tokenName: string } | null {
  for (const [name, token] of ctx.typographyTokens) {
    if (token.fontSize === node.fontSize) {
      if (!token.fontFamily || token.fontFamily === node.fontName?.family) {
        return { tokenName: name };
      }
    }
  }
  return null;
}
