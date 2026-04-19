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
import { tr } from '../../types.js';

/**
 * Whether this container is expected to lay out children in flow order
 * (vs. a freeform canvas where absolute positioning is intentional).
 */
const LAYOUT_ROLES = new Set([
  'screen',
  'page',
  'section',
  'form',
  'list',
  'row',
  'header',
  'footer',
  'nav',
  'card',
  'toolbar',
  'stats',
  'social_row',
  'button',
  'input',
]);
const LAYOUT_NAME_RE = /screen|section|form|list|row|header|footer|nav|navigation|toolbar|sidebar|card|page/i;

function isLayoutRoleContainer(node: AbstractNode): boolean {
  if (node.role && LAYOUT_ROLES.has(node.role)) return true;
  return LAYOUT_NAME_RE.test(node.name);
}

/** Any two children share > 50% bounding-box overlap → likely freeform composition. */
function hasHeavyOverlap(children: AbstractNode[]): boolean {
  for (let i = 0; i < children.length; i++) {
    const a = children[i];
    if (a.x == null || a.y == null || a.width == null || a.height == null) continue;
    for (let j = i + 1; j < children.length; j++) {
      const b = children[j];
      if (b.x == null || b.y == null || b.width == null || b.height == null) continue;
      const overlapW = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
      const overlapH = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
      const overlap = overlapW * overlapH;
      if (overlap <= 0) continue;
      const smaller = Math.min(a.width * a.height, b.width * b.height);
      if (smaller > 0 && overlap / smaller > 0.5) return true;
    }
  }
  return false;
}

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
  // Without auto-layout, child widths/positions are free-form — overflow
  // checks against the parent are meaningless until the parent itself adopts
  // a layout mode.
  suppressesInSubtree: ['overflow-parent', 'unbounded-hug'],

  check(node: AbstractNode, ctx: LintContext): LintViolation[] {
    if (node.type !== 'FRAME') return [];
    // Skip if already has auto-layout
    if (node.layoutMode && node.layoutMode !== 'NONE') return [];
    // Only flag frames with 2+ children (single child is often intentional)
    if (!node.children || node.children.length < 2) return [];
    // Skip very small frames (likely icons or decorative elements)
    if (node.width != null && node.height != null && node.width < 24 && node.height < 24) return [];
    // Skip intentionally-freeform nodes (overlays, absolute-positioned compositions).
    // Only flag layout-role containers where stacked/flow layout is expected.
    if (!isLayoutRoleContainer(node)) return [];
    // Skip when children are clearly overlap-stacked (e.g. image + badge overlay) —
    // any two children share > 50% bounding-box overlap → keep as freeform canvas.
    if (hasHeavyOverlap(node.children)) return [];

    const direction = inferDirection(node.children);

    return [
      {
        nodeId: node.id,
        nodeName: node.name,
        rule: 'no-autolayout',
        severity: 'heuristic',
        currentValue: `${node.children.length} children without auto-layout`,
        suggestion: tr(
          ctx.lang,
          `"${node.name}" has ${node.children.length} children but no auto-layout — children may overlap. Enable ${direction} auto-layout.`,
          `「${node.name}」有 ${node.children.length} 个子节点但未启用自动布局——子节点可能重叠。请启用 ${direction} 自动布局。`,
        ),
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
