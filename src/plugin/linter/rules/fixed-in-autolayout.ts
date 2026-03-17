/**
 * Fixed in auto-layout rule — detect absolute-positioned children in auto layout frames.
 *
 * When a child has layoutPositioning: 'ABSOLUTE' inside an auto layout frame,
 * it's often unintentional and breaks the layout flow.
 */

import type { AbstractNode, LintContext, LintViolation, LintRule } from '../types.js';

export const fixedInAutolayoutRule: LintRule = {
  name: 'fixed-in-autolayout',
  description: 'Detect absolute-positioned children inside auto layout frames.',
  category: 'layout',
  severity: 'warning',

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    // We check from the parent's perspective
    if (!node.layoutMode || node.layoutMode === 'NONE') return [];
    if (!node.children) return [];

    const violations: LintViolation[] = [];

    for (const child of node.children) {
      if (child.layoutPositioning === 'ABSOLUTE') {
        violations.push({
          nodeId: child.id,
          nodeName: child.name,
          rule: 'fixed-in-autolayout',
          severity: 'warning',
          currentValue: 'absolute positioning in auto layout',
          suggestion: `"${child.name}" uses absolute positioning inside auto layout "${node.name}" — this may be unintentional`,
          autoFixable: false,
        });
      }
    }

    return violations;
  },
};
