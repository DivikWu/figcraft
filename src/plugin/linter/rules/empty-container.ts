/**
 * Empty container rule — detect frames/groups with no visible children.
 */

import type { AbstractNode, LintContext, LintViolation, LintRule } from '../types.js';

export const emptyContainerRule: LintRule = {
  name: 'empty-container',
  description: 'Detect empty frames or groups with no visible children.',
  category: 'layout',
  severity: 'warning',

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    if (node.type !== 'FRAME' && node.type !== 'GROUP') return [];

    const hasVisibleChildren = node.children?.some((c) => c.type !== 'VECTOR' || c.width !== 0) ?? false;

    if (!hasVisibleChildren) {
      return [{
        nodeId: node.id,
        nodeName: node.name,
        rule: 'empty-container',
        severity: 'warning',
        currentValue: `${node.type} with ${node.children?.length ?? 0} children (none visible)`,
        suggestion: `"${node.name}" is an empty container — remove it or add content`,
        autoFixable: false,
      }];
    }

    return [];
  },
};
