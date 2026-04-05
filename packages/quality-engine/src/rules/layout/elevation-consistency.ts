/**
 * Elevation consistency rule — detect mixed shadow/flat styles among siblings.
 *
 * Flags auto-layout containers whose direct children inconsistently mix
 * drop shadows and no shadows. This indicates an unclear elevation strategy.
 *
 * Exception: children with effectStyleId are excluded (intentional style binding).
 */

import type { AbstractNode, LintContext, LintRule, LintViolation } from '../../types.js';

function hasVisibleDropShadow(node: AbstractNode): boolean {
  return !!node.effects?.some((e) => e.type === 'DROP_SHADOW' && e.visible !== false);
}

export const elevationConsistencyRule: LintRule = {
  name: 'elevation-consistency',
  description:
    'Sibling elements in the same container should share a consistent elevation strategy (all shadows or all flat).',
  category: 'layout',
  severity: 'heuristic',
  ai: {
    preventionHint:
      'Choose one elevation strategy per container: flat (borders only) or elevated (shadows). Do not mix.',
    phase: ['styling'],
  },

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    // Only check auto-layout containers with 2+ children
    if (!node.layoutMode || !node.children || node.children.length < 2) return [];

    // Filter to meaningful children (skip vectors, tiny elements)
    const meaningful = node.children.filter(
      (c) => (c.type === 'FRAME' || c.type === 'COMPONENT' || c.type === 'INSTANCE') && !c.effectStyleId, // Skip nodes with bound effect styles (intentional)
    );
    if (meaningful.length < 2) return [];

    const withShadow = meaningful.filter(hasVisibleDropShadow);
    const withoutShadow = meaningful.filter((c) => !hasVisibleDropShadow(c));

    // Mixed: some have shadows, some don't
    if (withShadow.length > 0 && withoutShadow.length > 0) {
      const shadowNames = withShadow
        .map((c) => c.name)
        .slice(0, 3)
        .join(', ');
      const flatNames = withoutShadow
        .map((c) => c.name)
        .slice(0, 3)
        .join(', ');
      return [
        {
          nodeId: node.id,
          nodeName: node.name,
          rule: 'elevation-consistency',
          severity: 'heuristic',
          currentValue: `${withShadow.length} with shadow (${shadowNames}), ${withoutShadow.length} flat (${flatNames})`,
          suggestion: `"${node.name}" mixes elevated and flat children. Add shadows to all cards or remove them for consistency.`,
          autoFixable: false,
        },
      ];
    }

    return [];
  },
};
