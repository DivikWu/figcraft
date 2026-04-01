/**
 * Line height sanity rule — flags text where lineHeight < 1.0× fontSize (lines overlap).
 * This is a conservative threshold to catch extreme cases; WCAG 2.1 SC 1.4.12 recommends 1.5×
 * but that is too aggressive for most design systems, so we use 1.0× as a practical floor.
 */

import type { AbstractNode, LintContext, LintViolation, LintRule, FixDescriptor } from '../../types.js';
import { DESIGN_CONSTANTS } from '../../constants.js';

const MIN_LINE_HEIGHT_RATIO = DESIGN_CONSTANTS.text.minLineHeightRatio;

export const wcagLineHeightRule: LintRule = {
  name: 'wcag-line-height',
  description: 'Check that line height is large enough to prevent text lines from overlapping.',
  category: 'wcag',
  severity: 'verbose',

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
      severity: 'verbose',
      currentValue: `${effectiveLineHeight.toFixed(1)}px (${ratio.toFixed(2)}x)`,
      expectedValue: `>= ${node.fontSize.toFixed(1)}px (${MIN_LINE_HEIGHT_RATIO}x)`,
      suggestion: `"${node.name}" line height is only ${ratio.toFixed(2)}× the font size — text lines will overlap. Increase line height to at least ${node.fontSize.toFixed(0)}px`,
      autoFixable: true,
      fixData: { lineHeight: Math.ceil(node.fontSize * MIN_LINE_HEIGHT_RATIO) },
    }];
  },

  describeFix(v): FixDescriptor | null {
    if (!v.fixData || v.fixData.lineHeight == null) return null;
    return { kind: 'set-properties', props: { lineHeight: v.fixData.lineHeight as number }, requireFontLoad: true };
  },
};
