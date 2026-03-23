import type { AbstractNode, LintContext, LintViolation, LintRule } from '../types.js';

function isNavLike(node: AbstractNode): boolean {
  if (node.role === 'nav') return true;
  return /nav|navigation|tabs|tab bar|menu/i.test(node.name);
}

export const navOvercrowdedRule: LintRule = {
  name: 'nav-overcrowded',
  description: 'Navigation rows should have enough horizontal room for their items instead of crowding or clipping controls.',
  category: 'layout',
  severity: 'warning',

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    if (node.type !== 'FRAME' && node.type !== 'COMPONENT') return [];
    if (!isNavLike(node)) return [];
    if (node.layoutMode !== 'HORIZONTAL') return [];
    if (!node.children || node.children.length < 2) return [];

    const availableWidth = node.width ?? node.parentWidth;
    if (availableWidth == null) return [];

    const spacing = node.itemSpacing ?? 0;
    const paddingLeft = node.paddingLeft ?? 0;
    const paddingRight = node.paddingRight ?? 0;
    const childWidths = node.children
      .map((child) => child.width)
      .filter((width): width is number => width != null);
    if (childWidths.length !== node.children.length) return [];

    const requiredWidth = paddingLeft + paddingRight +
      childWidths.reduce((sum, width) => sum + width, 0) +
      spacing * Math.max(0, node.children.length - 1);

    if (requiredWidth <= availableWidth + 4) return [];

    return [{
      nodeId: node.id,
      nodeName: node.name,
      rule: 'nav-overcrowded',
      severity: 'warning',
      currentValue: `needs ${Math.round(requiredWidth)}px but only has ${Math.round(availableWidth)}px`,
      suggestion: `"${node.name}" is too crowded for its navigation items. Reduce item count, shorten labels, or switch to a more spacious navigation pattern.`,
      autoFixable: false,
      fixData: { overflow: Math.round(requiredWidth - availableWidth) },
    }];
  },
};
