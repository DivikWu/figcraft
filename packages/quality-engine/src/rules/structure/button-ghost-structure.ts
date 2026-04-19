/**
 * button-ghost-structure — lint rule for transparent-container buttons.
 *
 * Ghost buttons are frame shells with no fill/stroke but with prototype
 * reactions or a component-set state axis. They need padding to form a
 * hit target, but the bar is lower than solid/outline.
 */

import type { LintContext, LintRule, LintViolation } from '../../types.js';
import { tr } from '../../types.js';
import { matchesInteractiveKind } from './_interactive-gate.js';

const MIN_HPAD_GHOST = 8;

export const buttonGhostStructureRule: LintRule = {
  name: 'button-ghost-structure',
  description: 'Ghost (transparent) buttons need padding for a usable hit target and an affordance signal.',
  category: 'layout',
  severity: 'heuristic',
  ai: {
    preventionHint:
      'Ghost buttons: FRAME with reactions or state variants, paddingLeft/Right ≥ 8, height ≥ 40. Must have hover/pressed variants for affordance.',
    phase: ['structure'],
    tags: ['button', 'button-ghost'],
  },

  check(node, ctx: LintContext): LintViolation[] {
    if (!matchesInteractiveKind(node, ['button-ghost'])) return [];
    const violations: LintViolation[] = [];

    if (!node.reactions && !node.componentPropertyDefinitions) {
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: 'button-ghost-structure',
        severity: 'heuristic',
        currentValue: 'no reactions or state variants',
        suggestion: tr(
          ctx.lang,
          `"${node.name}" ghost button has no reactions or state variants — without hover/pressed states, users can't tell it's clickable.`,
          `「${node.name}」透明按钮无交互或状态变体——没有 hover/pressed 态，用户无法感知可点击。`,
        ),
        autoFixable: false,
      });
    }

    if (node.type === 'FRAME') {
      const hPad = (node.paddingLeft ?? 0) + (node.paddingRight ?? 0);
      if (hPad < MIN_HPAD_GHOST) {
        violations.push({
          nodeId: node.id,
          nodeName: node.name,
          rule: 'button-ghost-structure',
          severity: 'heuristic',
          currentValue: `horizontal padding ${hPad}px`,
          suggestion: tr(
            ctx.lang,
            `"${node.name}" ghost button has ${hPad}px horizontal padding — hit target too tight.`,
            `「${node.name}」透明按钮水平内边距 ${hPad}px——点击区过窄。`,
          ),
          autoFixable: true,
          fixData: { fix: 'padding', paddingLeft: 12, paddingRight: 12 },
        });
      }
    }

    return violations;
  },

  describeFix(v) {
    if (!v.fixData) return null;
    if (v.fixData.fix === 'padding') {
      return {
        kind: 'set-properties',
        props: { paddingLeft: v.fixData.paddingLeft, paddingRight: v.fixData.paddingRight },
        requireType: ['FRAME', 'COMPONENT'],
      };
    }
    return null;
  },
};
