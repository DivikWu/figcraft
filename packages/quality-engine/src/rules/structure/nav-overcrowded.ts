import type { AbstractNode, LintContext, LintRule, LintViolation } from '../../types.js';
import { tr } from '../../types.js';
import { checkRowCramped, describeRowCrampedFix } from './row-cramped-helper.js';

function isNavLike(node: AbstractNode): boolean {
  if (node.role === 'nav') return true;
  return /nav|navigation|tabs|tab bar|menu/i.test(node.name);
}

export const navOvercrowdedRule: LintRule = {
  name: 'nav-overcrowded',
  description:
    'Navigation rows should have enough horizontal room for their items instead of crowding or clipping controls.',
  category: 'layout',
  severity: 'heuristic',

  check(node: AbstractNode, ctx: LintContext): LintViolation[] {
    return checkRowCramped(
      node,
      {
        ruleName: 'nav-overcrowded',
        detect: isNavLike,
        buildSuggestion: (name, lang) =>
          tr(
            lang,
            `"${name}" is too crowded for its navigation items. Reduce item count, shorten labels, or switch to a more spacious navigation pattern.`,
            `「${name}」导航项过于拥挤。请减少项数、缩短标签,或改用更宽松的导航形态。`,
          ),
      },
      ctx,
    );
  },

  describeFix: describeRowCrampedFix,
};
