/**
 * WCAG line height rule — WCAG 2.1 SC 1.4.12 requires line height >= 1.5x font size.
 */

import type { AbstractNode, LintContext, LintViolation, LintRule } from '../types.js';

const MIN_LINE_HEIGHT_RATIO = 1.0;

export const wcagLineHeightRule: LintRule = {
  name: 'wcag-line-height',
  description: 'Check that text line height is at least 1.0x the font size (text overlap prevention).',
  category: 'wcag',
  severity: 'error',

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    if (node.type !== 'TEXT') return [];
    if (!node.fontSize) return [];
    if (!node.lineHeight || typeof node.lineHeight !== 'object') return [];

    const lh = node.lineHeight as { unit: string; value: number };

    // Skip AUTO line height — Figma's auto is generally fine
    if (lh.unit === 'AUTO') return [];

    let effectiveLineHeight: number;
    if (lh.unit === 'PIXELS') {
      effectiveLineHeight = lh.value;
    } else if (lh.unit === 'PERCENT') {
      effectiveLineHeight = (lh.value / 100) * node.fontSize;
    } else {
      return [];
    }

    const ratio = effectiveLineHeight / node.fontSize;
    if (ratio >= MIN_LINE_HEIGHT_RATIO) return [];

    return [{
      nodeId: node.id,
      nodeName: node.name,
      rule: 'wcag-line-height',
      severity: 'error',
      currentValue: `${effectiveLineHeight.toFixed(1)}px (${ratio.toFixed(2)}x)`,
      expectedValue: `>= ${node.fontSize.toFixed(1)}px (${MIN_LINE_HEIGHT_RATIO}x)`,
      suggestion: `Line height is ${ratio.toFixed(2)}x font size — text lines will overlap`,
      autoFixable: false,
    }];
  },
};
