/**
 * button-text-structure — lint rule for bare-text CTA (e.g. "Forgot password?").
 *
 * Key departure from solid/outline: text buttons can be plain TEXT nodes —
 * they do NOT need to be frames. Instead, we check that they have a usable
 * tap target via either their own height, ancestor padding, or an explicit
 * hitbox annotation.
 */

import type { LintContext, LintRule, LintViolation } from '../../types.js';
import { tr } from '../../types.js';
import { satisfiesSpacingException } from '../../utils/wcag-spacing.js';
import { matchesInteractiveKind } from './_interactive-gate.js';

const MIN_LINE_BOX_HEIGHT = 24;

export const buttonTextStructureRule: LintRule = {
  name: 'button-text-structure',
  description: 'Text buttons need a usable tap target without being forced into a framed container.',
  category: 'layout',
  severity: 'heuristic',
  ai: {
    preventionHint:
      'Text buttons: plain TEXT with reactions, line-box height ≥ 24, or wrap in an auto-layout frame with padding to reach 44×44 touch target. Do NOT force a filled frame.',
    phase: ['structure'],
    tags: ['button', 'button-text'],
  },

  check(node, ctx: LintContext): LintViolation[] {
    if (!matchesInteractiveKind(node, ['button-text'])) return [];
    const violations: LintViolation[] = [];

    if (node.type === 'TEXT') {
      // For a bare TEXT node, verify its rendered height gives a reasonable
      // hit target. WCAG 2.5.8 Spacing exception: an undersized target in an
      // auto-layout parent with enough surrounding gap is tap-safe.
      if (node.height != null && node.height < MIN_LINE_BOX_HEIGHT) {
        const spacing = satisfiesSpacingException(node);
        if (!spacing.exempt) {
          violations.push({
            nodeId: node.id,
            nodeName: node.name,
            rule: 'button-text-structure',
            severity: 'heuristic',
            currentValue: `line height ${node.height}px, parent gap ${spacing.actualGap}px`,
            suggestion: tr(
              ctx.lang,
              `"${node.name}" text button renders at ${node.height}px tall — increase line-height to ${MIN_LINE_BOX_HEIGHT}px, or give the parent auto-layout itemSpacing ≥ ${spacing.requiredGap}px so WCAG 2.5.8 spacing exception applies.`,
              `「${node.name}」文字按钮行高 ${node.height}px——请提升行高至 ${MIN_LINE_BOX_HEIGHT}px，或让父自动布局 itemSpacing ≥ ${spacing.requiredGap}px 以满足 WCAG 2.5.8 spacing 豁免。`,
            ),
            autoFixable: false,
          });
        }
      }
      return violations;
    }

    // If it's a FRAME-shaped text button, just ensure it has some padding
    if (node.type === 'FRAME') {
      const totalPad = (node.paddingLeft ?? 0) + (node.paddingRight ?? 0);
      if (totalPad === 0 && node.height != null && node.height < 44) {
        violations.push({
          nodeId: node.id,
          nodeName: node.name,
          rule: 'button-text-structure',
          severity: 'heuristic',
          currentValue: `no padding + height ${node.height}px`,
          suggestion: tr(
            ctx.lang,
            `"${node.name}" text button has no padding and insufficient height — hit target is too small.`,
            `「${node.name}」文字按钮无内边距且高度不足——点击区过小。`,
          ),
          autoFixable: true,
          fixData: { fix: 'padding', paddingLeft: 8, paddingRight: 8 },
        });
      }
    }

    return violations;
  },

  describeFix(v) {
    if (v.fixData?.fix === 'padding') {
      return {
        kind: 'set-properties',
        props: { paddingLeft: v.fixData.paddingLeft, paddingRight: v.fixData.paddingRight },
        requireType: ['FRAME', 'COMPONENT'],
      };
    }
    return null;
  },
};
