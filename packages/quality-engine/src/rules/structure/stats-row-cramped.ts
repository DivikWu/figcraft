import type { AbstractNode, LintContext, LintRule, LintViolation } from '../../types.js';
import { tr } from '../../types.js';
import { checkRowCramped, describeRowCrampedFix } from './row-cramped-helper.js';

function isStatsLike(node: AbstractNode): boolean {
  if (node.role === 'stats') return true;
  return /stats|metrics|kpis?|summary/i.test(node.name);
}

export const statsRowCrampedRule: LintRule = {
  name: 'stats-row-cramped',
  description:
    'Stats rows should have enough width for each metric card instead of squeezing them into an unreadable strip.',
  category: 'layout',
  severity: 'heuristic',

  check(node: AbstractNode, ctx: LintContext): LintViolation[] {
    return checkRowCramped(
      node,
      {
        ruleName: 'stats-row-cramped',
        detect: isStatsLike,
        buildSuggestion: (name, lang) =>
          tr(
            lang,
            `"${name}" is too narrow for its metric cards. Reduce cards per row or switch to a stacked/grid layout before the numbers become unreadable.`,
            `「${name}」宽度不足以容纳指标卡片。请减少每行卡片数,或改为堆叠/网格布局,避免数字难以辨识。`,
          ),
      },
      ctx,
    );
  },

  describeFix: describeRowCrampedFix,
};
