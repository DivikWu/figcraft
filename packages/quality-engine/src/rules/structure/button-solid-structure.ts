/**
 * button-solid-structure — lint rule for filled CTA buttons.
 *
 * Activates only when classifier commits to `button-solid`. Checks:
 *  1. must be FRAME/COMPONENT/INSTANCE
 *  2. auto-layout enabled
 *  3. horizontal padding ≥ 16px
 *  4. height ≥ 44 (mobile) / 36 (desktop)
 */

import { DESIGN_CONSTANTS } from '../../constants.js';
import type { FixDescriptor, LintContext, LintRule, LintViolation } from '../../types.js';
import { tr } from '../../types.js';
import { satisfiesSpacingException } from '../../utils/wcag-spacing.js';
import { matchesInteractiveKind } from './_interactive-gate.js';

const MIN_HPAD = DESIGN_CONSTANTS.button.minHPad;
/** WCAG 2.5.8 AA floor. Below this, Spacing exception applies. */
const MIN_HEIGHT = 24;
/** iOS HIG / Material comfortable ideal — surfaced in copy only. */
const IDEAL_HEIGHT = 44;

export const buttonSolidStructureRule: LintRule = {
  name: 'button-solid-structure',
  description: 'Filled CTA buttons must be auto-layout frames with adequate padding and touch target.',
  category: 'layout',
  severity: 'heuristic',
  ai: {
    preventionHint:
      'Solid buttons: auto-layout FRAME/COMPONENT with layoutMode HORIZONTAL, paddingLeft/Right ≥ 16, height ≥ 44 mobile / 36 desktop, primary+counter axis CENTER.',
    phase: ['structure'],
    tags: ['button', 'button-solid'],
  },

  check(node, ctx: LintContext): LintViolation[] {
    if (!matchesInteractiveKind(node, ['button-solid'])) return [];
    const violations: LintViolation[] = [];

    if (node.type !== 'FRAME' && node.type !== 'COMPONENT' && node.type !== 'INSTANCE') {
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: 'button-solid-structure',
        severity: 'heuristic',
        currentValue: `${node.type} used as solid button`,
        suggestion: tr(
          ctx.lang,
          `"${node.name}" is a filled button but rendered as ${node.type}. Use an auto-layout FRAME with centered text inside.`,
          `「${node.name}」是填充按钮但渲染为 ${node.type}。请用带居中文本的自动布局 FRAME。`,
        ),
        autoFixable: false,
      });
      return violations;
    }

    if (!node.layoutMode || node.layoutMode === 'NONE') {
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: 'button-solid-structure',
        severity: 'heuristic',
        currentValue: 'no auto-layout',
        suggestion: tr(
          ctx.lang,
          `"${node.name}" solid button is missing auto-layout. Set layoutMode HORIZONTAL and center alignment.`,
          `「${node.name}」填充按钮缺少自动布局。请设置 layoutMode HORIZONTAL 并居中对齐。`,
        ),
        autoFixable: true,
        fixData: {
          fix: 'layout',
          layoutMode: 'HORIZONTAL',
          primaryAxisAlignItems: 'CENTER',
          counterAxisAlignItems: 'CENTER',
        },
      });
    }

    if (node.type === 'FRAME' && node.layoutMode && node.layoutMode !== 'NONE') {
      const hPad = (node.paddingLeft ?? 0) + (node.paddingRight ?? 0);
      if (hPad < MIN_HPAD) {
        violations.push({
          nodeId: node.id,
          nodeName: node.name,
          rule: 'button-solid-structure',
          severity: 'heuristic',
          currentValue: `horizontal padding ${hPad}px`,
          suggestion: tr(
            ctx.lang,
            `"${node.name}" solid button has horizontal padding ${hPad}px (< ${MIN_HPAD}px). Give the label breathing room.`,
            `「${node.name}」填充按钮水平内边距 ${hPad}px 不足（< ${MIN_HPAD}px）。文字需要呼吸空间。`,
          ),
          autoFixable: true,
          fixData: {
            fix: 'padding',
            paddingLeft: Math.max(node.paddingLeft ?? 0, 24),
            paddingRight: Math.max(node.paddingRight ?? 0, 24),
          },
        });
      }
    }

    if (node.type === 'FRAME' && node.height != null && node.height < MIN_HEIGHT) {
      // WCAG 2.5.8 Spacing exception: undersized target + enough parent gap is tap-safe.
      const spacing = satisfiesSpacingException(node);
      if (!spacing.exempt) {
        violations.push({
          nodeId: node.id,
          nodeName: node.name,
          rule: 'button-solid-structure',
          severity: 'heuristic',
          currentValue: `height ${node.height}px, parent gap ${spacing.actualGap}px`,
          suggestion: tr(
            ctx.lang,
            `"${node.name}" solid button is ${node.height}px tall — below WCAG ${MIN_HEIGHT}px minimum. Raise to ${IDEAL_HEIGHT}px (iOS HIG ideal) or ensure parent auto-layout itemSpacing ≥ ${spacing.requiredGap}px so Spacing exception applies.`,
            `「${node.name}」填充按钮高度 ${node.height}px——低于 WCAG 最小 ${MIN_HEIGHT}px。请调整到 ${IDEAL_HEIGHT}px（iOS HIG 推荐），或让父自动布局 itemSpacing ≥ ${spacing.requiredGap}px 以满足 spacing 豁免。`,
          ),
          autoFixable: true,
          fixData: { fix: 'height', height: IDEAL_HEIGHT },
        });
      }
    }

    return violations;
  },

  describeFix(v): FixDescriptor | null {
    if (!v.fixData) return null;
    switch (v.fixData.fix as string) {
      case 'layout':
        return {
          kind: 'set-properties',
          props: {
            layoutMode: v.fixData.layoutMode,
            primaryAxisAlignItems: v.fixData.primaryAxisAlignItems,
            counterAxisAlignItems: v.fixData.counterAxisAlignItems,
          },
          requireType: ['FRAME', 'COMPONENT'],
        };
      case 'padding':
        return {
          kind: 'set-properties',
          props: {
            paddingLeft: v.fixData.paddingLeft,
            paddingRight: v.fixData.paddingRight,
          },
          requireType: ['FRAME', 'COMPONENT'],
        };
      case 'height':
        return {
          kind: 'resize',
          height: v.fixData.height as number,
          minHeight: v.fixData.height as number,
          requireType: ['FRAME', 'COMPONENT'],
        };
      default:
        return null;
    }
  },
};
