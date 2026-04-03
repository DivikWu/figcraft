import { SCREEN_NAME_RE } from '../../constants.js';
import type { AbstractNode, LintContext, LintRule, LintViolation } from '../../types.js';

function isScreenLike(node: AbstractNode): boolean {
  return node.role === 'screen' || SCREEN_NAME_RE.test(node.name);
}

export const screenBottomOverflowRule: LintRule = {
  name: 'screen-bottom-overflow',
  description: 'Screen children should stay within the visible viewport instead of extending past the bottom edge.',
  category: 'layout',
  severity: 'unsafe',

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    if (node.type !== 'FRAME' && node.type !== 'COMPONENT') return [];
    if (!isScreenLike(node)) return [];
    if (node.height == null || !node.children || node.children.length === 0) return [];

    const violations: LintViolation[] = [];
    for (const child of node.children) {
      if (child.y == null || child.height == null) continue;
      const bottom = child.y + child.height;
      if (bottom > node.height + 8) {
        violations.push({
          nodeId: child.id,
          nodeName: child.name,
          rule: 'screen-bottom-overflow',
          severity: 'unsafe',
          currentValue: `bottom edge ${Math.round(bottom)}px exceeds screen height ${Math.round(node.height)}px`,
          suggestion: `"${child.name}" extends beyond the bottom of "${node.name}". Reduce vertical space usage or move the section upward.`,
          autoFixable: false,
        });
      }
    }
    return violations;
  },
};
