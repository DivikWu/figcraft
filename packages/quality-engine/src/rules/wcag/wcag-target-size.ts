/**
 * WCAG 2.5.8 Target Size (Minimum, AA) — interactive elements ≥ 24×24.
 * WCAG 2.5.5 AAA (44×44) is the enhanced ideal (iOS HIG / Material) and is
 * surfaced in the prevention hint copy only, not enforced.
 *
 * Ownership model: when the classifier commits to an interactive kind, the
 * corresponding variant rule (`button-solid-structure`, `link-standalone-
 * structure`, etc.) owns size enforcement for that kind — including Spacing
 * and Inline exception handling. This rule only runs as a legacy safety net
 * for nodes whose kind couldn't be classified (low confidence, missing
 * declaration) but whose name hints at interactivity.
 */

import type { AbstractNode, FixDescriptor, LintContext, LintRule, LintViolation } from '../../types.js';
import { tr } from '../../types.js';
import { satisfiesSpacingException } from '../../utils/wcag-spacing.js';

/** WCAG 2.5.8 AA floor — below this, check Spacing exception before emitting. */
const MIN_TARGET_SIZE = 24;
/** iOS HIG / Material comfortable ideal — copy only, not enforced. */
const IDEAL_TARGET_SIZE = 44;

/**
 * Node names that suggest interactive elements (legacy heuristic fallback).
 * Patterns use word boundaries to avoid matching substrings like "Tabs - Light"
 * (layout container), "Table", "Tablet", or a plain text glyph named "Tab".
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
  description:
    'Fallback touch-target check for unclassified interactive-looking nodes — WCAG 2.5.8 AA minimum 24×24 with Spacing exception.',
  category: 'wcag',
  severity: 'heuristic',
  ai: {
    preventionHint: `Interactive elements must be at least ${MIN_TARGET_SIZE}×${MIN_TARGET_SIZE}px (WCAG 2.5.8 AA); ${IDEAL_TARGET_SIZE}×${IDEAL_TARGET_SIZE} preferred per iOS HIG / Material. Declare interactiveKind so the variant-specific rule can apply the correct contract.`,
    phase: ['accessibility'],
    tags: ['button', 'input'],
  },

  check(node: AbstractNode, ctx: LintContext): LintViolation[] {
    // When the classifier committed to an interactive kind, that kind's variant
    // rule owns the size contract (including WCAG 2.5.8 Spacing exception +
    // Inline exception). Running the generic check here would double-report.
    if (node.interactive?.kind) return [];

    // TEXT nodes are never the click target — the wrapping FRAME/COMPONENT is.
    // Flagging a glyph named "Tab" inside a Tab component would blame the label
    // for the parent's size, and auto-fix wrapping would nest a container that
    // already exists. Skip text entirely; the container gets checked on its own.
    if (node.type === 'TEXT') return [];

    // Legacy fallback — only fire for nodes whose name looks interactive.
    const isInteractive = INTERACTIVE_PATTERNS.some((p) => p.test(node.name));
    if (!isInteractive) return [];

    const w = node.width ?? 0;
    const h = node.height ?? 0;

    if (w < MIN_TARGET_SIZE || h < MIN_TARGET_SIZE) {
      // WCAG 2.5.8 Spacing exception
      const spacing = satisfiesSpacingException(node);
      if (spacing.exempt) return [];
      return [
        {
          nodeId: node.id,
          nodeName: node.name,
          rule: 'wcag-target-size',
          severity: 'heuristic',
          currentValue: `${w}×${h}, parent gap ${spacing.actualGap}px`,
          expectedValue: `>= ${MIN_TARGET_SIZE}×${MIN_TARGET_SIZE}`,
          suggestion: tr(
            ctx.lang,
            `"${node.name}" is ${w}×${h} — below WCAG 2.5.8 ${MIN_TARGET_SIZE}×${MIN_TARGET_SIZE} minimum. Resize to ${IDEAL_TARGET_SIZE}×${IDEAL_TARGET_SIZE} (iOS HIG ideal) or give the parent auto-layout itemSpacing ≥ ${spacing.requiredGap}px so Spacing exception applies.`,
            `「${node.name}」尺寸 ${w}×${h}——低于 WCAG 2.5.8 最小 ${MIN_TARGET_SIZE}×${MIN_TARGET_SIZE}。请调整到 ${IDEAL_TARGET_SIZE}×${IDEAL_TARGET_SIZE}（iOS HIG 推荐），或让父自动布局 itemSpacing ≥ ${spacing.requiredGap}px 以满足 spacing 豁免。`,
          ),
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

    return {
      kind: 'resize',
      ...(cw < MIN_TARGET_SIZE ? { width: IDEAL_TARGET_SIZE } : {}),
      ...(ch < MIN_TARGET_SIZE ? { height: IDEAL_TARGET_SIZE } : {}),
    };
  },
};
