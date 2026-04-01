/**
 * WCAG contrast rule — check text/background contrast ratio.
 *
 * Walks up the node tree (via parentBgColor on AbstractNode) to find the
 * nearest ancestor with a solid fill, then checks contrast against that
 * background. Falls back to white/black worst-case when no parent bg is known.
 */

import type { AbstractNode, LintContext, LintViolation, LintRule } from '../../types.js';
import { hexToRgbTuple } from '../../utils/color.js';
import { contrastRatioTuple, isLargeText } from './wcag-helpers.js';

/**
 * Extract the effective background color from a node's parentBgColor field.
 * Returns an RGB tuple or null if unknown.
 */
function getParentBg(node: AbstractNode): [number, number, number] | null {
  if (!node.parentBgColor) return null;
  return hexToRgbTuple(node.parentBgColor);
}

export const wcagContrastRule: LintRule = {
  name: 'wcag-contrast',
  description: 'Check that text has enough contrast against its background for readability (WCAG AA).',
  category: 'wcag',
  severity: 'unsafe',
  ai: {
    preventionHint: 'Ensure text has at least 4.5:1 contrast ratio against its background (3:1 for large text ≥18px or ≥14px bold)',
    phase: ['accessibility'],
    tags: ['text'],
  },

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    if (node.type !== 'TEXT') return [];
    if (!node.fills || node.fills.length === 0) return [];

    const fgFill = node.fills.find((f) => f.type === 'SOLID' && f.visible !== false);
    if (!fgFill?.color) return [];

    const fgRgb = hexToRgbTuple(fgFill.color);
    if (!fgRgb) return [];

    const large = isLargeText(node.fontSize, node.fontName?.style);
    const threshold = large ? 3 : 4.5;

    // Use actual parent background when available, otherwise fall back to white/black
    const parentBg = getParentBg(node);
    if (parentBg) {
      const ratio = contrastRatioTuple(fgRgb, parentBg);
      if (ratio >= threshold) return [];
      return [{
        nodeId: node.id,
        nodeName: node.name,
        rule: 'wcag-contrast',
        severity: 'unsafe',
        currentValue: `${ratio.toFixed(2)}:1`,
        expectedValue: `>= ${threshold}:1`,
        suggestion: `"${node.name}" text color may be hard to read — contrast is only ${ratio.toFixed(2)}:1 against its background (needs at least ${threshold}:1)`,
        autoFixable: false,
      }];
    }

    // Fallback: check against both white and black (conservative)
    const ratioOnWhite = contrastRatioTuple(fgRgb, [1, 1, 1]);
    const ratioOnBlack = contrastRatioTuple(fgRgb, [0, 0, 0]);

    if (ratioOnWhite >= threshold || ratioOnBlack >= threshold) {
      return [];
    }

    const worstRatio = Math.max(ratioOnWhite, ratioOnBlack);
    return [{
      nodeId: node.id,
      nodeName: node.name,
      rule: 'wcag-contrast',
      severity: 'unsafe',
      currentValue: `${worstRatio.toFixed(2)}:1`,
      expectedValue: `>= ${threshold}:1`,
      suggestion: `"${node.name}" text color may be hard to read — contrast is only ${worstRatio.toFixed(2)}:1 (needs at least ${threshold}:1)`,
      autoFixable: false,
    }];
  },
};
