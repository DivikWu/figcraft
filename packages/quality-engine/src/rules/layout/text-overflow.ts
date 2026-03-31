/**
 * Text overflow rule — detect text nodes that are likely clipped by their parent.
 *
 * Flags text nodes where:
 * - Text node width exceeds parent width (likely truncated/clipped)
 * - Estimated text content width significantly exceeds the node's rendered width
 *
 * Auto-fix strategy depends on parent layout:
 * - In auto-layout parent: set textAutoResize to HEIGHT (width is managed by layout)
 * - In non-auto-layout parent: set textAutoResize to WIDTH_AND_HEIGHT
 */

import type { AbstractNode, LintContext, LintViolation, LintRule } from '../../types.js';

function pickFixResize(node: AbstractNode): string {
  // If parent has auto-layout, width is managed by the layout engine.
  // Only expand height so text wraps within the allocated width.
  const parentHasAL = node.parentLayoutMode === 'HORIZONTAL' || node.parentLayoutMode === 'VERTICAL';
  return parentHasAL ? 'HEIGHT' : 'WIDTH_AND_HEIGHT';
}

export const textOverflowRule: LintRule = {
  name: 'text-overflow',
  description: 'Detect text nodes that overflow or are clipped by their parent container.',
  category: 'layout',
  severity: 'heuristic',

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    if (node.type !== 'TEXT') return [];
    if (node.width == null || !node.characters) return [];

    const violations: LintViolation[] = [];
    const fixResize = pickFixResize(node);

    // Method 1: Compare text node width against parent width (propagated by engine)
    if (node.parentWidth != null && node.parentWidth > 0 && node.width > node.parentWidth) {
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: 'text-overflow',
        severity: 'heuristic',
        currentValue: `text width ${Math.round(node.width)}px exceeds parent ${Math.round(node.parentWidth)}px`,
        suggestion: `"${node.name}" text overflows its parent container. Set textAutoResize: ${fixResize}.`,
        autoFixable: true,
        fixData: { textAutoResize: fixResize },
      });
      return violations; // Don't double-report
    }

    // Method 2: Heuristic — estimate text width from character count
    const isSingleLine = !node.characters.includes('\n');
    const estimatedCharWidth = (node.fontSize ?? 16) * 0.6;
    const estimatedTextWidth = node.characters.length * estimatedCharWidth;

    // Flag if estimated text width significantly exceeds the node width
    // (text is being clipped to a smaller area)
    if (isSingleLine && estimatedTextWidth > 500 && node.width < estimatedTextWidth * 0.5) {
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: 'text-overflow',
        severity: 'heuristic',
        currentValue: `text "${node.characters.slice(0, 30)}..." (est. ${Math.round(estimatedTextWidth)}px) in ${Math.round(node.width)}px node`,
        suggestion: `"${node.name}" text appears clipped. Set textAutoResize: ${fixResize}.`,
        autoFixable: true,
        fixData: { textAutoResize: fixResize },
      });
    }

    return violations;
  },
};
