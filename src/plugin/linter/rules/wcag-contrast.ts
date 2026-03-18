/**
 * WCAG contrast rule — check text/background contrast ratio.
 */

import type { AbstractNode, LintContext, LintViolation, LintRule } from '../types.js';
import { hexToRgbTuple } from '../../utils/color.js';
import { contrastRatioTuple, isLargeText } from './wcag-helpers.js';

export const wcagContrastRule: LintRule = {
  name: 'wcag-contrast',
  description: 'Check that text has enough contrast against its background for readability (WCAG AA).',
  category: 'wcag',
  severity: 'error',

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    if (node.type !== 'TEXT') return [];
    if (!node.fills || node.fills.length === 0) return [];

    const fgFill = node.fills.find((f) => f.type === 'SOLID' && f.visible !== false);
    if (!fgFill?.color) return [];

    const fgRgb = hexToRgbTuple(fgFill.color);
    if (!fgRgb) return [];

    const large = isLargeText(node.fontSize, node.fontName?.style);
    const threshold = large ? 3 : 4.5;

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
      severity: 'error',
      currentValue: `${worstRatio.toFixed(2)}:1`,
      expectedValue: `>= ${threshold}:1`,
      suggestion: `"${node.name}" text color may be hard to read — contrast is only ${worstRatio.toFixed(2)}:1 (needs at least ${threshold}:1)`,
      autoFixable: false,
    }];
  },
};
