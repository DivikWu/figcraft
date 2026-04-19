/**
 * Empty container rule — detect frames/groups with no visible children.
 */

import type { AbstractNode, LintContext, LintRule, LintViolation } from '../../types.js';
import { tr } from '../../types.js';
import { SPACER_RE } from './spacer-frame.js';

export const emptyContainerRule: LintRule = {
  name: 'empty-container',
  description: 'Detect empty frames or groups that have no visible content inside.',
  category: 'layout',
  severity: 'verbose',
  ai: {
    preventionHint: 'Every container must have at least one visible child — do not create empty wrapper frames',
    phase: ['layout'],
    tags: ['frame'],
  },

  check(node: AbstractNode, ctx: LintContext): LintViolation[] {
    if (node.type !== 'FRAME' && node.type !== 'GROUP') return [];

    const hasVisibleChildren = node.children?.some((c) => c.type !== 'VECTOR' || c.width !== 0) ?? false;

    if (!hasVisibleChildren) {
      // spacer-frame covers empty FRAMEs matching spacer naming or thin+fill-less —
      // it has a more specific auto-fix (remove-and-redistribute). Defer to it.
      if (node.type === 'FRAME') {
        const isSpacerName = SPACER_RE.test(node.name);
        const hasNoVisibleFill =
          !node.fills ||
          node.fills.length === 0 ||
          node.fills.every((f) => f.visible === false || f.opacity === 0);
        const isThin =
          (node.width != null && node.width <= 4) || (node.height != null && node.height <= 4);
        if (isSpacerName || (hasNoVisibleFill && isThin)) return [];
      }
      return [
        {
          nodeId: node.id,
          nodeName: node.name,
          rule: 'empty-container',
          severity: 'verbose',
          currentValue: `${node.type} with ${node.children?.length ?? 0} children (none visible)`,
          suggestion: tr(
            ctx.lang,
            `"${node.name}" is an empty container with nothing visible inside — remove it or add content`,
            `「${node.name}」是空容器,没有任何可见内容——请删除或添加内容`,
          ),
          autoFixable: false,
        },
      ];
    }

    return [];
  },
};
