/**
 * No auto-layout rule — detect frames with multiple children but no auto-layout.
 *
 * Frames with 2+ children and no auto-layout rely on absolute positioning,
 * which causes overlapping children and non-responsive layouts. This is the
 * most common structural mistake in AI-generated Figma designs.
 *
 * Auto-fix: enable VERTICAL auto-layout (most common direction for stacked content).
 * The fix also infers direction from children positions when possible.
 */

import type { AbstractNode, FixDescriptor, LintContext, LintRule, LintViolation } from '../../types.js';

/** Infer layout direction from children positions. */
function inferDirection(children: AbstractNode[]): 'HORIZONTAL' | 'VERTICAL' {
  if (children.length < 2) return 'VERTICAL';

  // Check if children are arranged more horizontally or vertically
  let horizontalSpread = 0;
  let verticalSpread = 0;

  for (let i = 1; i < children.length; i++) {
    const prev = children[i - 1];
    const curr = children[i];
    if (prev.x != null && curr.x != null) {
      horizontalSpread += Math.abs(curr.x - prev.x);
    }
    if (prev.y != null && curr.y != null) {
      verticalSpread += Math.abs(curr.y - prev.y);
    }
  }

  return horizontalSpread > verticalSpread ? 'HORIZONTAL' : 'VERTICAL';
}

export const noAutolayoutRule: LintRule = {
  name: 'no-autolayout',
  description:
    'Detect frames with multiple children but no auto-layout, causing overlapping or non-responsive layouts.',
  category: 'layout',
  severity: 'heuristic',
  ai: {
    preventionHint: 'Containers with 2+ children must always set layoutMode (HORIZONTAL or VERTICAL)',
    phase: ['layout'],
  },

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    if (node.type !== 'FRAME') return [];
    // Skip if already has auto-layout
    if (node.layoutMode && node.layoutMode !== 'NONE') return [];
    // Only flag frames with 2+ children (single child is often intentional)
    if (!node.children || node.children.length < 2) return [];
    // Skip very small frames (likely icons or decorative elements)
    if (node.width != null && node.height != null && node.width < 24 && node.height < 24) return [];

    const direction = inferDirection(node.children);

    return [
      {
        nodeId: node.id,
        nodeName: node.name,
        rule: 'no-autolayout',
        severity: 'heuristic',
        currentValue: `${node.children.length} children without auto-layout`,
        suggestion: `"${node.name}" has ${node.children.length} children but no auto-layout — children may overlap. Enable ${direction} auto-layout.`,
        autoFixable: true,
        fixData: {
          fix: 'autolayout',
          layoutMode: direction,
        },
      },
    ];
  },

  describeFix(v): FixDescriptor | null {
    if (!v.fixData) return null;
    return {
      kind: 'set-properties',
      props: { layoutMode: v.fixData.layoutMode ?? 'VERTICAL' },
      requireType: ['FRAME', 'COMPONENT'],
    };
  },
};
