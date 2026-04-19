/**
 * link-standalone-structure — structural lint for independent text links
 * (e.g. "Forgot password?", "Learn more →").
 *
 * Scope is STRUCTURE only — line-box height on mobile, with WCAG 2.5.8
 * Spacing exception honored. Color-binding / token semantics are covered
 * by `hardcoded-token` and `spec-color` on whichever node actually carries
 * the fill (typically the TEXT child of a link shell FRAME). Single
 * responsibility: this rule never inspects colors.
 */

import type { LintContext, LintRule, LintViolation } from '../../types.js';
import { tr } from '../../types.js';
import { satisfiesSpacingException } from '../../utils/wcag-spacing.js';
import { matchesInteractiveKind } from './_interactive-gate.js';

const MIN_LINE_HEIGHT_MOBILE = 24;

export const linkStandaloneStructureRule: LintRule = {
  name: 'link-standalone-structure',
  description:
    'Standalone links need a tap-friendly line-box on mobile (or satisfy WCAG 2.5.8 Spacing exception via surrounding itemSpacing).',
  category: 'layout',
  severity: 'heuristic',
  ai: {
    preventionHint:
      'Standalone links: line-box height ≥ 24px on mobile, OR parent auto-layout itemSpacing ≥ (12 − height/2) so WCAG 2.5.8 Spacing exception applies. Color binding is enforced by hardcoded-token on the TEXT node.',
    phase: ['structure'],
    tags: ['link', 'link-standalone'],
  },

  check(node, ctx: LintContext): LintViolation[] {
    if (!matchesInteractiveKind(node, ['link-standalone'])) return [];
    const violations: LintViolation[] = [];

    // Mobile line-box check: link line needs to be tall enough to tap.
    // WCAG 2.5.8 Spacing exception: an undersized target in an auto-layout
    // parent whose itemSpacing ≥ (12 − height/2) is tap-safe (the notional
    // 24-px circle doesn't overlap neighboring targets). We honor that here
    // rather than emit a spurious warning.
    if (node.platform === 'mobile' && node.height != null && node.height < MIN_LINE_HEIGHT_MOBILE) {
      const spacing = satisfiesSpacingException(node);
      if (!spacing.exempt) {
        violations.push({
          nodeId: node.id,
          nodeName: node.name,
          rule: 'link-standalone-structure',
          severity: 'heuristic',
          currentValue: `line height ${node.height}px, parent gap ${spacing.actualGap}px`,
          suggestion: tr(
            ctx.lang,
            `"${node.name}" link is ${node.height}px tall on mobile — increase line-height to ${MIN_LINE_HEIGHT_MOBILE}px, or give the parent auto-layout itemSpacing ≥ ${spacing.requiredGap}px so WCAG 2.5.8 spacing exception applies.`,
            `「${node.name}」链接在移动端行高 ${node.height}px——请提升行高至 ${MIN_LINE_HEIGHT_MOBILE}px，或让父自动布局 itemSpacing ≥ ${spacing.requiredGap}px 以满足 WCAG 2.5.8 spacing 豁免。`,
          ),
          autoFixable: false,
        });
      }
    }

    return violations;
  },

  describeFix() {
    return null;
  },
};
