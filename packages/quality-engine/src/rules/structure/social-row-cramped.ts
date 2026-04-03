import type { AbstractNode, LintContext, LintRule, LintViolation } from '../../types.js';

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

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    if (node.type !== 'FRAME' && node.type !== 'COMPONENT') return [];
    if (!isSocialRow(node)) return [];
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

    const overflow = Math.round(requiredWidth - availableWidth);
    const violation: LintViolation = {
      nodeId: node.id,
      nodeName: node.name,
      rule: 'social-row-cramped',
      severity: 'heuristic',
      currentValue: `needs ${Math.round(requiredWidth)}px but only has ${Math.round(availableWidth)}px`,
      suggestion: `"${node.name}" does not have enough width for its social actions. Reduce item count, increase width, or stack the actions vertically before they start clipping.`,
      autoFixable: false,
      fixData: { overflow },
    };
    return [violation];
  },
};
