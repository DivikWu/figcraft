/**
 * WCAG target size rule — interactive elements should be >= 44x44px.
 */

import { DESIGN_CONSTANTS } from '../../constants.js';
import type { AbstractNode, FixDescriptor, LintContext, LintRule, LintViolation } from '../../types.js';

const MIN_TARGET_SIZE = DESIGN_CONSTANTS.touch.minSize;

/** Node names that suggest interactive elements. */
const INTERACTIVE_PATTERNS = [
  /button/i,
  /btn/i,
  /link/i,
  /tab/i,
  /toggle/i,
  /checkbox/i,
  /radio/i,
  /switch/i,
  /input/i,
  /icon.*button/i,
  /clickable/i,
  /touchable/i,
];

export const wcagTargetSizeRule: LintRule = {
  name: 'wcag-target-size',
  description: 'Check that buttons and interactive elements are large enough to tap easily (at least 44×44px).',
  category: 'wcag',
  severity: 'heuristic',
  ai: {
    preventionHint: `Interactive elements (buttons, links, toggles) must be at least ${MIN_TARGET_SIZE}×${MIN_TARGET_SIZE}px for touch targets`,
    phase: ['accessibility'],
    tags: ['button', 'input'],
  },

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    // Only check nodes that look interactive
    const isInteractive = INTERACTIVE_PATTERNS.some((p) => p.test(node.name));
    if (!isInteractive) return [];

    const w = node.width ?? 0;
    const h = node.height ?? 0;

    if (w < MIN_TARGET_SIZE || h < MIN_TARGET_SIZE) {
      return [
        {
          nodeId: node.id,
          nodeName: node.name,
          rule: 'wcag-target-size',
          severity: 'heuristic',
          currentValue: `${w}x${h}`,
          expectedValue: `>= ${MIN_TARGET_SIZE}x${MIN_TARGET_SIZE}`,
          suggestion: `"${node.name}" is only ${w}×${h}px — make it at least ${MIN_TARGET_SIZE}×${MIN_TARGET_SIZE}px so it's easy to tap`,
          autoFixable: true,
          fixData: { currentWidth: w, currentHeight: h, nodeType: node.type },
        },
      ];
    }

    return [];
  },

  describeFix(v): FixDescriptor | null {
    if (!v.fixData) return null;
    const cw = v.fixData.currentWidth as number;
    const ch = v.fixData.currentHeight as number;
    const nodeType = v.fixData.nodeType as string | undefined;

    // TEXT nodes should be wrapped in a container rather than resized directly
    if (nodeType === 'TEXT') {
      return {
        kind: 'deferred',
        strategy: 'wrap-touch-target',
        data: {
          minWidth: Math.max(MIN_TARGET_SIZE, cw),
          minHeight: MIN_TARGET_SIZE,
        },
      };
    }

    return {
      kind: 'resize',
      ...(cw < MIN_TARGET_SIZE ? { width: MIN_TARGET_SIZE } : {}),
      ...(ch < MIN_TARGET_SIZE ? { height: MIN_TARGET_SIZE } : {}),
    };
  },
};
