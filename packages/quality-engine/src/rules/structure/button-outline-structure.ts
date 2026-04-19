/**
 * button-outline-structure — lint rule for stroke-only CTA buttons.
 *
 * Activates only when classifier commits to `button-outline`. Checks:
 *  1. must be FRAME/COMPONENT/INSTANCE + auto-layout
 *  2. at least one visible stroke with weight ≥ 1
 *  3. horizontal padding ≥ 16
 *  4. height ≥ 44 mobile / 36 desktop
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

export const buttonOutlineStructureRule: LintRule = {
  name: 'button-outline-structure',
  description: 'Outline buttons must have a visible stroke, auto-layout, padding and height.',
  category: 'layout',
  severity: 'heuristic',
  ai: {
    preventionHint:
      'Outline buttons: auto-layout FRAME/COMPONENT with visible stroke (weight ≥ 1), paddingLeft/Right ≥ 16, height ≥ 44 mobile / 36 desktop.',
    phase: ['structure'],
    tags: ['button', 'button-outline'],
  },

  check(node, ctx: LintContext): LintViolation[] {
    if (!matchesInteractiveKind(node, ['button-outline'])) return [];
    const violations: LintViolation[] = [];

    if (node.type !== 'FRAME' && node.type !== 'COMPONENT' && node.type !== 'INSTANCE') return [];

    if (!node.layoutMode || node.layoutMode === 'NONE') {
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: 'button-outline-structure',
        severity: 'heuristic',
        currentValue: 'no auto-layout',
        suggestion: tr(
          ctx.lang,
          `"${node.name}" outline button missing auto-layout. Set layoutMode HORIZONTAL and center alignment.`,
          `「${node.name}」描边按钮缺少自动布局。请设置 layoutMode HORIZONTAL 并居中对齐。`,
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

    const hasVisibleStroke = node.strokes?.some((s) => s.visible !== false);
    const weight = typeof node.strokeWeight === 'number' ? node.strokeWeight : 1;
    if (!hasVisibleStroke || weight < 1) {
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: 'button-outline-structure',
        severity: 'heuristic',
        currentValue: !hasVisibleStroke ? 'no visible stroke' : `stroke weight ${weight}`,
        suggestion: tr(
          ctx.lang,
          `"${node.name}" outline button needs a visible stroke with weight ≥ 1.`,
          `「${node.name}」描边按钮需要一条可见的 ≥ 1px 描边。`,
        ),
        autoFixable: false,
      });
    }

    if (node.type === 'FRAME' && node.layoutMode && node.layoutMode !== 'NONE') {
      const hPad = (node.paddingLeft ?? 0) + (node.paddingRight ?? 0);
      if (hPad < MIN_HPAD) {
        violations.push({
          nodeId: node.id,
          nodeName: node.name,
          rule: 'button-outline-structure',
          severity: 'heuristic',
          currentValue: `horizontal padding ${hPad}px`,
          suggestion: tr(
            ctx.lang,
            `"${node.name}" outline button has horizontal padding ${hPad}px (< ${MIN_HPAD}px).`,
            `「${node.name}」描边按钮水平内边距 ${hPad}px 不足（< ${MIN_HPAD}px）。`,
          ),
          autoFixable: true,
          fixData: { fix: 'padding', paddingLeft: 24, paddingRight: 24 },
        });
      }
    }

    if (node.type === 'FRAME' && node.height != null && node.height < MIN_HEIGHT) {
      const spacing = satisfiesSpacingException(node);
      if (!spacing.exempt) {
        violations.push({
          nodeId: node.id,
          nodeName: node.name,
          rule: 'button-outline-structure',
          severity: 'heuristic',
          currentValue: `height ${node.height}px, parent gap ${spacing.actualGap}px`,
          suggestion: tr(
            ctx.lang,
            `"${node.name}" outline button is ${node.height}px tall — below WCAG ${MIN_HEIGHT}px minimum. Raise to ${IDEAL_HEIGHT}px or ensure parent auto-layout itemSpacing ≥ ${spacing.requiredGap}px.`,
            `「${node.name}」描边按钮高度 ${node.height}px——低于 WCAG 最小 ${MIN_HEIGHT}px。请调整到 ${IDEAL_HEIGHT}px，或让父自动布局 itemSpacing ≥ ${spacing.requiredGap}px。`,
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
          props: { paddingLeft: v.fixData.paddingLeft, paddingRight: v.fixData.paddingRight },
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
