/**
 * WCAG target size rule — interactive elements should be >= 44x44px.
 */

import { DESIGN_CONSTANTS } from '../../constants.js';
import type { AbstractNode, FixDescriptor, LintContext, LintRule, LintViolation } from '../../types.js';

const MIN_TARGET_SIZE = DESIGN_CONSTANTS.touch.minSize;

/**
 * Node names that suggest interactive elements. Patterns use word boundaries
 * to avoid matching substrings like "Tabs - Light" (layout wrapper), "Table",
 * "Tablet", or a plain text glyph named "Tab".
 */
const INTERACTIVE_PATTERNS = [
  /\bbutton\b/i,
  /\bbtn\b/i,
  /\blink\b/i,
  /\btab\b/i,
  /\btoggle\b/i,
  /\bcheckbox\b/i,
  /\bradio\b/i,
  /\bswitch\b/i,
  /\binput\b/i,
  /icon[-_\s]*button/i,
  /\bclickable\b/i,
  /\btouchable\b/i,
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
    // TEXT nodes are never the click target — the wrapping FRAME/COMPONENT is.
    // Flagging a glyph named "Tab" inside a Tab component would blame the label
    // for the parent's size, and auto-fix wrapping would nest a container that
    // already exists. Skip text entirely; the container gets checked on its own.
    if (node.type === 'TEXT') return [];

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
          fixData: { currentWidth: w, currentHeight: h },
        },
      ];
    }

    return [];
  },

  describeFix(v): FixDescriptor | null {
    if (!v.fixData) return null;
    const cw = v.fixData.currentWidth as number;
    const ch = v.fixData.currentHeight as number;

    return {
      kind: 'resize',
      ...(cw < MIN_TARGET_SIZE ? { width: MIN_TARGET_SIZE } : {}),
      ...(ch < MIN_TARGET_SIZE ? { height: MIN_TARGET_SIZE } : {}),
    };
  },
};
