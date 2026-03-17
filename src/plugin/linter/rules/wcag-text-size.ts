/**
 * WCAG text size rule — minimum readable text size.
 */

import type { AbstractNode, LintContext, LintViolation, LintRule } from '../types.js';

const MIN_TEXT_SIZE = 12;

export const wcagTextSizeRule: LintRule = {
  name: 'wcag-text-size',
  description: `Detect text smaller than ${MIN_TEXT_SIZE}px which may be difficult to read.`,
  category: 'wcag',
  severity: 'warning',

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    if (node.type !== 'TEXT') return [];
    if (!node.fontSize || node.fontSize >= MIN_TEXT_SIZE) return [];

    return [{
      nodeId: node.id,
      nodeName: node.name,
      rule: 'wcag-text-size',
      severity: 'warning',
      currentValue: `${node.fontSize}px`,
      expectedValue: `>= ${MIN_TEXT_SIZE}px`,
      suggestion: `Text "${node.name}" is ${node.fontSize}px — consider using at least ${MIN_TEXT_SIZE}px for readability`,
      autoFixable: true,
      fixData: { fontSize: MIN_TEXT_SIZE },
    }];
  },
};
