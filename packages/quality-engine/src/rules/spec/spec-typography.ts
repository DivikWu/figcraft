/**
 * Spec typography rule — detect text nodes not using a text style token.
 */

import type { AbstractNode, FixDescriptor, LintContext, LintRule, LintViolation } from '../../types.js';
import { tr } from '../../types.js';

export const specTypographyRule: LintRule = {
  name: 'spec-typography',
  description: 'Detect text layers with custom font settings that should use a typography token.',
  category: 'token',
  severity: 'error',
  ai: {
    preventionHint: 'Apply a shared text style token instead of setting fontSize/fontFamily manually',
    phase: ['styling'],
    tags: ['text'],
  },

  check(node: AbstractNode, ctx: LintContext): LintViolation[] {
    if (node.type !== 'TEXT') return [];
    if (node.textStyleId) return []; // already using a style
    // Text inside a COMPONENT/INSTANCE: the component author controls typography.
    if (node.insideComponentSubtree) return [];

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
          suggestion: tr(
            ctx.lang,
            `"${node.name}" uses custom font settings — apply text style "${match.tokenName}" instead`,
            `「${node.name}」使用了自定义字体设置——建议应用文字样式「${match.tokenName}」`,
          ),
          autoFixable: true,
          fixData: { tokenName: match.tokenName },
        });
      }
    }

    return violations;
  },

  describeFix(v): FixDescriptor | null {
    if (!v.fixData?.tokenName) return null;
    return { kind: 'deferred', strategy: 'library-text-style', data: { tokenName: v.fixData.tokenName } };
  },
};

function findMatchingTypography(node: AbstractNode, ctx: LintContext): { tokenName: string } | null {
  for (const [name, token] of ctx.typographyTokens) {
    if (token.fontSize === node.fontSize) {
      if (!token.fontFamily || token.fontFamily === node.fontName?.family) {
        return { tokenName: name };
      }
    }
  }
  return null;
}
