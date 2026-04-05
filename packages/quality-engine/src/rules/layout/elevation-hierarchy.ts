/**
 * Elevation hierarchy rule — child shadows should not be stronger than parent's.
 *
 * A child element with a larger shadow blur radius than its parent container
 * violates visual depth hierarchy (child appears to float above parent).
 */

import type { AbstractNode, LintContext, LintRule, LintViolation } from '../../types.js';

/** Get the maximum drop shadow blur radius for a node, or 0 if no shadows. */
function maxShadowBlur(node: AbstractNode): number {
  if (!node.effects) return 0;
  let max = 0;
  for (const e of node.effects) {
    if (e.type === 'DROP_SHADOW' && e.visible !== false && e.radius != null) {
      if (e.radius > max) max = e.radius;
    }
  }
  return max;
}

export const elevationHierarchyRule: LintRule = {
  name: 'elevation-hierarchy',
  description: 'Child elements should not have stronger shadows than their parent container.',
  category: 'layout',
  severity: 'heuristic',
  ai: {
    preventionHint: 'Child elements should not have stronger shadows than their parent container.',
    phase: ['styling'],
  },

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    if (!node.children || node.children.length === 0) return [];

    const parentBlur = maxShadowBlur(node);
    // Only check when parent has a shadow (otherwise there's no hierarchy to violate)
    if (parentBlur === 0) return [];

    const violations: LintViolation[] = [];
    for (const child of node.children) {
      if (child.type !== 'FRAME' && child.type !== 'COMPONENT' && child.type !== 'INSTANCE') continue;
      const childBlur = maxShadowBlur(child);
      if (childBlur > parentBlur) {
        violations.push({
          nodeId: child.id,
          nodeName: child.name,
          rule: 'elevation-hierarchy',
          severity: 'heuristic',
          currentValue: `shadow blur ${childBlur}px (parent: ${parentBlur}px)`,
          suggestion: `"${child.name}" has a stronger shadow (${childBlur}px) than its parent "${node.name}" (${parentBlur}px). Reduce child shadow to maintain visual hierarchy.`,
          autoFixable: false,
        });
      }
    }

    return violations;
  },
};
