/**
 * Overflow parent rule — detect children that exceed their parent's inner space.
 *
 * Flags child nodes whose width or height exceeds the parent's available inner space
 * (parent dimension minus padding). This catches visual clipping that is almost always
 * unintentional in auto-layout containers.
 *
 * Auto-fix: set layoutAlign=STRETCH (for cross-axis overflow) or reduce child dimension.
 */

import type { AbstractNode, LintContext, LintViolation, LintRule, FixDescriptor, RuleAI } from '../../types.js';

function getInnerWidth(node: AbstractNode): number | null {
  if (node.width == null) return null;
  const pl = node.paddingLeft ?? 0;
  const pr = node.paddingRight ?? 0;
  return node.width - pl - pr;
}

function getInnerHeight(node: AbstractNode): number | null {
  if (node.height == null) return null;
  const pt = node.paddingTop ?? 0;
  const pb = node.paddingBottom ?? 0;
  return node.height - pt - pb;
}

export const overflowParentRule: LintRule = {
  name: 'overflow-parent',
  description: 'Detect children that overflow their parent container bounds.',
  category: 'layout',
  severity: 'unsafe',
  ai: {
    preventionHint: 'Responsive children (inputs, buttons, dividers, content sections) use layoutAlign: STRETCH to fill parent width',
    phase: ['layout'],
  },

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    // Only check containers with auto-layout (non-AL containers use absolute positioning)
    if (node.type !== 'FRAME' && node.type !== 'COMPONENT') return [];
    if (!node.layoutMode || node.layoutMode === 'NONE') return [];
    if (!node.children || node.children.length === 0) return [];
    // Skip if clipsContent is explicitly false — designer intends overflow
    if (node.clipsContent === false) return [];

    const violations: LintViolation[] = [];
    const innerW = getInnerWidth(node);
    const innerH = getInnerHeight(node);
    const isVertical = node.layoutMode === 'VERTICAL';

    for (const child of node.children) {
      if (child.width == null || child.height == null) continue;
      // Skip absolute-positioned children
      if (child.layoutPositioning === 'ABSOLUTE') continue;

      // Cross-axis overflow check
      // In VERTICAL layout, cross-axis is width; in HORIZONTAL, cross-axis is height
      if (isVertical && innerW != null && child.width > innerW + 1) {
        violations.push({
          nodeId: child.id,
          nodeName: child.name,
          rule: 'overflow-parent',
          severity: 'unsafe',
          currentValue: `width ${Math.round(child.width)}px exceeds parent inner width ${Math.round(innerW)}px`,
          suggestion: `"${child.name}" overflows "${node.name}" horizontally. Set layoutAlign: STRETCH or reduce width.`,
          autoFixable: true,
          fixData: {
            fix: 'stretch',
            layoutAlign: 'STRETCH',
          },
        });
      } else if (!isVertical && innerH != null && child.height > innerH + 1) {
        violations.push({
          nodeId: child.id,
          nodeName: child.name,
          rule: 'overflow-parent',
          severity: 'unsafe',
          currentValue: `height ${Math.round(child.height)}px exceeds parent inner height ${Math.round(innerH)}px`,
          suggestion: `"${child.name}" overflows "${node.name}" vertically. Set layoutAlign: STRETCH or reduce height.`,
          autoFixable: true,
          fixData: {
            fix: 'stretch',
            layoutAlign: 'STRETCH',
          },
        });
      }
    }

    return violations;
  },

  describeFix(v): FixDescriptor | null {
    if (!v.fixData) return null;
    return { kind: 'set-properties', props: { layoutAlign: v.fixData.layoutAlign ?? 'STRETCH' } };
  },
};
