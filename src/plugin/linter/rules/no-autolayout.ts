/**
 * No auto-layout rule — detect frames that likely should use auto layout.
 *
 * Only flags frames with 2+ children that appear to be arranged in a
 * clear horizontal or vertical pattern, to avoid false positives on
 * decorative overlays or intentional absolute positioning.
 */

import type { AbstractNode, LintContext, LintViolation, LintRule } from '../types.js';

export const noAutolayoutRule: LintRule = {
  name: 'no-autolayout',
  description: 'Detect frames with linearly arranged children that should use auto layout.',
  category: 'layout',
  severity: 'info',

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    if (node.type !== 'FRAME') return [];
    if (node.layoutMode && node.layoutMode !== 'NONE') return [];

    const children = node.children?.filter((c) => c.width && c.height) ?? [];
    if (children.length < 2) return [];

    // Check if children are arranged linearly (horizontal or vertical)
    const direction = detectLinearArrangement(children);
    if (!direction) return [];

    return [{
      nodeId: node.id,
      nodeName: node.name,
      rule: 'no-autolayout',
      severity: 'info',
      currentValue: `${children.length} children arranged ${direction}ly without auto layout`,
      suggestion: `"${node.name}" has ${children.length} children in a ${direction} arrangement — consider using auto layout`,
      autoFixable: false,
    }];
  },
};

function detectLinearArrangement(children: AbstractNode[]): 'horizontal' | 'vertical' | null {
  if (children.length < 2) return null;

  // Sort by position
  const byX = [...children].sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
  const byY = [...children].sort((a, b) => (a.y ?? 0) - (b.y ?? 0));

  // Check horizontal: children don't overlap on X axis and share similar Y
  const isHorizontal = checkLinear(byX, 'x', 'width', 'y');
  if (isHorizontal) return 'horizontal';

  // Check vertical: children don't overlap on Y axis and share similar X
  const isVertical = checkLinear(byY, 'y', 'height', 'x');
  if (isVertical) return 'vertical';

  return null;
}

function checkLinear(
  sorted: AbstractNode[],
  posKey: 'x' | 'y',
  sizeKey: 'width' | 'height',
  crossKey: 'x' | 'y',
): boolean {
  let nonOverlapping = 0;
  const crossPositions: number[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = sorted[i];
    const next = sorted[i + 1];
    const currEnd = (curr[posKey] ?? 0) + (curr[sizeKey] ?? 0);
    const nextStart = next[posKey] ?? 0;

    // Allow small overlap (< 2px) for anti-aliasing
    if (nextStart >= currEnd - 2) nonOverlapping++;
    crossPositions.push(curr[crossKey] ?? 0);
  }
  crossPositions.push(sorted[sorted.length - 1][crossKey] ?? 0);

  // At least 80% of pairs should be non-overlapping
  if (nonOverlapping / (sorted.length - 1) < 0.8) return false;

  // Cross-axis positions should be similar (within 50px spread)
  const minCross = Math.min(...crossPositions);
  const maxCross = Math.max(...crossPositions);
  return (maxCross - minCross) < 50;
}
