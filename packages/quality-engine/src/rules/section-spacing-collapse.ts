import type { AbstractNode, LintContext, LintViolation, LintRule } from '../types.js';

function isSectionStack(node: AbstractNode): boolean {
  return node.role === 'screen' ||
    node.role === 'body' ||
    node.role === 'content' ||
    node.role === 'actions' ||
    /screen|page|content|body|form|footer|actions/i.test(node.name);
}

export const sectionSpacingCollapseRule: LintRule = {
  name: 'section-spacing-collapse',
  description: 'Major vertical section stacks should keep a healthy itemSpacing rhythm instead of collapsing sections together.',
  category: 'layout',
  severity: 'warning',

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    if (node.type !== 'FRAME' && node.type !== 'COMPONENT') return [];
    if (node.layoutMode !== 'VERTICAL') return [];
    if (!isSectionStack(node)) return [];
    if (!node.children || node.children.length < 3) return [];

    const frameLikeChildren = node.children.filter((child) => child.type === 'FRAME' || child.type === 'INSTANCE' || child.type === 'COMPONENT');
    if (frameLikeChildren.length < 3) return [];

    const spacing = node.itemSpacing ?? 0;
    if (spacing >= 12) return [];

    return [{
      nodeId: node.id,
      nodeName: node.name,
      rule: 'section-spacing-collapse',
      severity: 'warning',
      currentValue: `itemSpacing ${spacing}px across ${frameLikeChildren.length} sections`,
      suggestion: `"${node.name}" packs major sections too tightly. Increase itemSpacing to restore a clearer vertical rhythm.`,
      autoFixable: true,
      fixData: {
        fix: 'item-spacing',
        itemSpacing: 16,
      },
    }];
  },
};
