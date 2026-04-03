import type { AbstractNode, LintContext, LintRule, LintViolation } from '../../types.js';

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

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    if (node.type !== 'FRAME' && node.type !== 'COMPONENT') return [];
    if (!isStatsLike(node)) return [];
    if (node.layoutMode !== 'HORIZONTAL') return [];
    if (!node.children || node.children.length < 2) return [];

    const availableWidth = node.width ?? node.parentWidth;
    if (availableWidth == null) return [];

    const spacing = node.itemSpacing ?? 0;
    const paddingLeft = node.paddingLeft ?? 0;
    const paddingRight = node.paddingRight ?? 0;
    const childWidths = node.children.map((child) => child.width).filter((width): width is number => width != null);
    if (childWidths.length !== node.children.length) return [];

    const requiredWidth =
      paddingLeft +
      paddingRight +
      childWidths.reduce((sum, width) => sum + width, 0) +
      spacing * Math.max(0, node.children.length - 1);

    if (requiredWidth <= availableWidth + 4) return [];

    return [
      {
        nodeId: node.id,
        nodeName: node.name,
        rule: 'stats-row-cramped',
        severity: 'heuristic',
        currentValue: `needs ${Math.round(requiredWidth)}px but only has ${Math.round(availableWidth)}px`,
        suggestion: `"${node.name}" is too narrow for its metric cards. Reduce cards per row or switch to a stacked/grid layout before the numbers become unreadable.`,
        autoFixable: false,
        fixData: { overflow: Math.round(requiredWidth - availableWidth) },
      },
    ];
  },
};
