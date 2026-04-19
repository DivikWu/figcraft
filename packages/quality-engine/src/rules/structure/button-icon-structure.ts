/**
 * button-icon-structure — lint rule for icon-only buttons.
 *
 * Tap target threshold follows WCAG 2.5.8 Target Size (Minimum, AA) at 24×24,
 * with the Spacing exception honored. iOS HIG / Material Design recommend
 * 44×44 as the comfortable ideal, but that's a preference — not a hard spec.
 * Icon-only buttons also need an accessible label (descriptive name or
 * annotation) so screen readers can announce the action.
 */

import type { LintContext, LintRule, LintViolation } from '../../types.js';
import { tr } from '../../types.js';
import { satisfiesSpacingException } from '../../utils/wcag-spacing.js';
import { matchesInteractiveKind } from './_interactive-gate.js';

/** WCAG 2.5.8 AA floor. Below this, target is "undersized" and Spacing exception applies. */
const MIN_TOUCH = 24;
/** iOS HIG / Material comfortable ideal — surfaced in advice copy only, not enforced. */
const IDEAL_TOUCH = 44;

export const buttonIconStructureRule: LintRule = {
  name: 'button-icon-structure',
  description:
    'Icon-only buttons need ≥ 24×24 tap target (WCAG 2.5.8 AA, or smaller via Spacing exception) and an accessible label.',
  category: 'layout',
  severity: 'heuristic',
  ai: {
    preventionHint: `Icon buttons: square FRAME ≥ ${MIN_TOUCH}×${MIN_TOUCH} (WCAG AA); ${IDEAL_TOUCH}×${IDEAL_TOUCH} preferred per iOS HIG / Material. Wrap a VECTOR/SVG; give the frame a descriptive name or accessibility annotation so screen readers can announce the action.`,
    phase: ['structure'],
    tags: ['button', 'button-icon', 'a11y'],
  },

  check(node, ctx: LintContext): LintViolation[] {
    if (!matchesInteractiveKind(node, ['button-icon', 'button-fab'])) return [];
    const violations: LintViolation[] = [];

    if (node.width != null && node.height != null) {
      if (node.width < MIN_TOUCH || node.height < MIN_TOUCH) {
        // WCAG 2.5.8 Spacing exception: undersized target in an auto-layout
        // parent whose gap ≥ (12 − halfDimension) is tap-safe. Let it pass.
        const spacing = satisfiesSpacingException(node);
        if (!spacing.exempt) {
          violations.push({
            nodeId: node.id,
            nodeName: node.name,
            rule: 'button-icon-structure',
            severity: 'heuristic',
            currentValue: `${node.width}×${node.height}, parent gap ${spacing.actualGap}px`,
            suggestion: tr(
              ctx.lang,
              `"${node.name}" icon button is ${node.width}×${node.height} — below WCAG 2.5.8 ${MIN_TOUCH}×${MIN_TOUCH} minimum. Resize to ${IDEAL_TOUCH}×${IDEAL_TOUCH} (iOS HIG ideal) or give parent auto-layout itemSpacing ≥ ${spacing.requiredGap}px so spacing exception applies.`,
              `「${node.name}」图标按钮 ${node.width}×${node.height}——低于 WCAG 2.5.8 最小 ${MIN_TOUCH}×${MIN_TOUCH}。请调整到 ${IDEAL_TOUCH}×${IDEAL_TOUCH}（iOS HIG 推荐），或让父自动布局 itemSpacing ≥ ${spacing.requiredGap}px 以满足 spacing 豁免。`,
            ),
            autoFixable: true,
            fixData: {
              fix: 'resize',
              width: Math.max(node.width, IDEAL_TOUCH),
              height: Math.max(node.height, IDEAL_TOUCH),
            },
          });
        }
      }
    }

    // Accessibility: a generic name on an icon-only button gives screen readers
    // nothing to announce. Real annotation data isn't in AbstractNode today;
    // the node name is the best available signal.
    const nameLooksDescriptive =
      node.name.length >= 3 && !/^(icon|vector|ellipse|rect|frame|group|svg)(\s*\d*|-\d+)?$/i.test(node.name);
    if (!nameLooksDescriptive) {
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: 'button-icon-structure',
        severity: 'heuristic',
        currentValue: `generic name "${node.name}"`,
        suggestion: tr(
          ctx.lang,
          `"${node.name}" icon button has a generic name — rename it descriptively or attach an accessibility annotation so screen readers know what it does.`,
          `「${node.name}」图标按钮命名过于通用——请改为描述性名称或附加无障碍注解，让屏幕阅读器能播报动作。`,
        ),
        autoFixable: false,
      });
    }

    return violations;
  },

  describeFix(v) {
    if (v.fixData?.fix === 'resize') {
      return {
        kind: 'resize',
        width: v.fixData.width as number,
        height: v.fixData.height as number,
        requireType: ['FRAME', 'COMPONENT'],
      };
    }
    return null;
  },
};
