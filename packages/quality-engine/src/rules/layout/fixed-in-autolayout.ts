/**
 * Fixed in auto-layout rule — detect absolute-positioned children in auto layout frames.
 *
 * When a child has layoutPositioning: 'ABSOLUTE' inside an auto layout frame,
 * it's often unintentional and breaks the layout flow.
 */

import type { AbstractNode, LintContext, LintRule, LintViolation } from '../../types.js';

export const fixedInAutolayoutRule: LintRule = {
  name: 'fixed-in-autolayout',
  description: 'Detect layers set to absolute position inside an auto layout frame, which may break the layout.',
  category: 'layout',
  severity: 'unsafe',
  ai: {
    preventionHint:
      'Do not use layoutPositioning: ABSOLUTE inside auto-layout frames — it breaks flow; use a wrapper frame instead',
    phase: ['layout'],
    tags: ['frame'],
  },

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
          severity: 'unsafe',
          currentValue: 'absolute positioning in auto layout',
          suggestion: `"${child.name}" is set to absolute position inside auto layout "${node.name}" — this may break the layout flow`,
          autoFixable: false,
        });
      }
    }

    return violations;
  },
};
