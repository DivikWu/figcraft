/**
 * missing-responsive — Warn when top-level frames lack auto layout or constraints.
 *
 * Frames that are direct children of the page (top-level) should have
 * either auto layout or constraints set for responsive behavior.
 * Only checks FRAME nodes at the root level (not nested children).
 *
 * Category: layout | Severity: info
 */

import type { AbstractNode, LintContext, LintViolation, LintRule } from '../types.js';

export const missingResponsiveRule: LintRule = {
  name: 'missing-responsive',
  description: 'Detect top-level frames without auto layout that may lack responsive behavior.',
  category: 'layout',
  severity: 'info',

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    if (node.type !== 'FRAME') return [];

    // Only meaningful for frames with children
    const children = node.children ?? [];
    if (children.length === 0) return [];

    // Skip if already has auto layout
    if (node.layoutMode && node.layoutMode !== 'NONE') return [];

    // Skip small frames (likely icons or decorative elements)
    if ((node.width ?? 0) < 100 || (node.height ?? 0) < 100) return [];

    // Check if any children have auto layout (nested responsive)
    const hasResponsiveChild = children.some(
      (c) => c.layoutMode && c.layoutMode !== 'NONE',
    );
    if (hasResponsiveChild) return [];

    return [{
      nodeId: node.id,
      nodeName: node.name,
      rule: 'missing-responsive',
      severity: 'info',
      currentValue: 'no auto layout',
      suggestion: `"${node.name}" is a large frame (${node.width}x${node.height}) without auto layout — consider adding auto layout for responsive behavior`,
      autoFixable: false,
    }];
  },
};
