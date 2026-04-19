/**
 * Spacer frame rule — detect empty frames used as spacing hacks.
 *
 * Flags frames that:
 * - Have no visible children (or no children at all)
 * - Have a name matching "Spacer" pattern (e.g. "Spacer 1", "Spacer", "spacer-2")
 * - OR have no fill and one dimension is very small (≤4px width or height)
 *
 * These are anti-patterns in Figma. Use semantic grouping with
 * auto-layout itemSpacing instead.
 */

import type { AbstractNode, FixDescriptor, LintContext, LintRule, LintViolation } from '../../types.js';
import { tr } from '../../types.js';

// Unified spacer detection — matches all known AI-generated spacer naming patterns
export const SPACER_RE =
  /^(?:(?:top|bottom|left|right|flex|vertical|horizontal)[\s_-]?)?(?:spacer|space|gap)(?:[\s_-]?(?:top|bottom|left|right|\d+))?$/i;

function isEmptyOrInvisible(node: AbstractNode): boolean {
  if (!node.children || node.children.length === 0) return true;
  return !node.children.some((c) => c.type !== 'VECTOR' || c.width !== 0);
}

function hasNoVisibleFill(node: AbstractNode): boolean {
  if (!node.fills || node.fills.length === 0) return true;
  return node.fills.every((f) => f.visible === false || f.opacity === 0);
}

export const spacerFrameRule: LintRule = {
  name: 'spacer-frame',
  description: 'Detect empty frames used as spacing hacks. Use auto-layout itemSpacing with semantic grouping instead.',
  category: 'layout',
  severity: 'style',
  ai: {
    preventionHint: 'No empty Spacer frames — use semantic groups with itemSpacing instead',
    phase: ['layout'],
  },

  check(node: AbstractNode, ctx: LintContext): LintViolation[] {
    if (node.type !== 'FRAME') return [];
    if (!isEmptyOrInvisible(node)) return [];

    // Check 1: Name matches spacer pattern
    const nameMatch = SPACER_RE.test(node.name);

    // Check 2: Invisible thin frame (no fill, one dimension ≤ 4px)
    const thinSpacer =
      hasNoVisibleFill(node) && ((node.width != null && node.width <= 4) || (node.height != null && node.height <= 4));

    if (!nameMatch && !thinSpacer) return [];

    return [
      {
        nodeId: node.id,
        nodeName: node.name,
        rule: 'spacer-frame',
        severity: 'style',
        currentValue: `${node.width ?? '?'}×${node.height ?? '?'} empty frame`,
        suggestion: tr(
          ctx.lang,
          `"${node.name}" looks like a spacing hack. Group related elements into semantic auto-layout frames with itemSpacing instead.`,
          `「${node.name}」像是手写的间距 hack。请把相关元素放入有语义的自动布局容器,用 itemSpacing 控制间距。`,
        ),
        autoFixable: true,
        fixData: {
          action: 'remove-spacer',
          width: node.width,
          height: node.height,
        },
      },
    ];
  },

  describeFix(v): FixDescriptor | null {
    if (!v.fixData) return null;
    return {
      kind: 'remove-and-redistribute',
      dimension: { width: v.fixData.width as number | undefined, height: v.fixData.height as number | undefined },
    };
  },
};
