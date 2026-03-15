/**
 * WCAG target size rule — interactive elements should be >= 44x44px.
 */

import type { AbstractNode, LintContext, LintViolation, LintRule } from '../types.js';

const MIN_TARGET_SIZE = 44;

/** Node names that suggest interactive elements. */
const INTERACTIVE_PATTERNS = [
  /button/i, /btn/i, /link/i, /tab/i, /toggle/i,
  /checkbox/i, /radio/i, /switch/i, /input/i,
  /icon.*button/i, /clickable/i, /touchable/i,
];

export const wcagTargetSizeRule: LintRule = {
  name: 'wcag-target-size',
  description: 'Check that interactive elements meet WCAG 2.5.8 minimum target size (44x44px).',

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    // Only check nodes that look interactive
    const isInteractive = INTERACTIVE_PATTERNS.some((p) => p.test(node.name));
    if (!isInteractive) return [];

    const w = node.width ?? 0;
    const h = node.height ?? 0;

    if (w < MIN_TARGET_SIZE || h < MIN_TARGET_SIZE) {
      return [{
        nodeId: node.id,
        nodeName: node.name,
        rule: 'wcag-target-size',
        currentValue: `${w}x${h}`,
        expectedValue: `>= ${MIN_TARGET_SIZE}x${MIN_TARGET_SIZE}`,
        suggestion: `Interactive element "${node.name}" is ${w}x${h}px, should be at least ${MIN_TARGET_SIZE}x${MIN_TARGET_SIZE}px`,
        autoFixable: false,
      }];
    }

    return [];
  },
};
