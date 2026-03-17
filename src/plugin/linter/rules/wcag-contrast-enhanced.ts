/**
 * WCAG AAA enhanced contrast rule — stricter thresholds (7:1 / 4.5:1).
 */

import type { AbstractNode, LintContext, LintViolation, LintRule } from '../types.js';
import { hexToRgbTuple } from '../../utils/color.js';
import { contrastRatioTuple, isLargeText } from './wcag-helpers.js';

export const wcagContrastEnhancedRule: LintRule = {
  name: 'wcag-contrast-enhanced',
  description: 'Check WCAG AAA enhanced contrast ratio (7:1 for normal text, 4.5:1 for large text).',
  category: 'wcag',
  severity: 'warning',

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    if (node.type !== 'TEXT') return [];
    if (!node.fills || node.fills.length === 0) return [];

    const fgFill = node.fills.find((f) => f.type === 'SOLID' && f.visible !== false);
    if (!fgFill?.color) return [];

    const fgRgb = hexToRgbTuple(fgFill.color);
    if (!fgRgb) return [];

    const large = isLargeText(node.fontSize, node.fontName?.style);
    const threshold = large ? 4.5 : 7;

    const ratioOnWhite = contrastRatioTuple(fgRgb, [1, 1, 1]);
    const ratioOnBlack = contrastRatioTuple(fgRgb, [0, 0, 0]);

    if (ratioOnWhite >= threshold || ratioOnBlack >= threshold) {
      return [];
    }

    const worstRatio = Math.max(ratioOnWhite, ratioOnBlack);
    return [{
      nodeId: node.id,
      nodeName: node.name,
      rule: 'wcag-contrast-enhanced',
      severity: 'warning',
      currentValue: `${worstRatio.toFixed(2)}:1`,
      expectedValue: `>= ${threshold}:1 (AAA)`,
      suggestion: `Text color does not meet AAA enhanced contrast (${worstRatio.toFixed(2)}:1 best-case, need ${threshold}:1)`,
      autoFixable: false,
    }];
  },
};
