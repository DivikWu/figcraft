import type { AbstractNode, LintContext, LintRule, LintViolation } from '../../types.js';
import { tr } from '../../types.js';
import { checkRowCramped, describeRowCrampedFix } from './row-cramped-helper.js';

function isSocialRow(node: AbstractNode): boolean {
  if (node.role === 'social_row') return true;
  return /social|oauth|continue with|sign in with|apple|google|facebook|wechat/i.test(node.name);
}

export const socialRowCrampedRule: LintRule = {
  name: 'social-row-cramped',
  description:
    'Social login rows should have enough horizontal room for their children instead of compressing or clipping them.',
  category: 'layout',
  severity: 'heuristic',

  check(node: AbstractNode, ctx: LintContext): LintViolation[] {
    return checkRowCramped(
      node,
      {
        ruleName: 'social-row-cramped',
        detect: isSocialRow,
        buildSuggestion: (name, lang) =>
          tr(
            lang,
            `"${name}" does not have enough width for its social actions. Reduce item count, increase width, or stack the actions vertically before they start clipping.`,
            `「${name}」宽度不足以容纳社交登录按钮。请减少按钮数量、增加宽度,或改为纵向堆叠,避免裁剪。`,
          ),
      },
      ctx,
    );
  },

  describeFix: describeRowCrampedFix,
};
