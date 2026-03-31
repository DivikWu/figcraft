/**
 * WCAG text size rule — minimum readable text size.
 */

import type { AbstractNode, LintContext, LintViolation, LintRule } from '../../types.js';

const MIN_TEXT_SIZE = 12;

export const wcagTextSizeRule: LintRule = {
  name: 'wcag-text-size',
  description: `Detect text smaller than ${MIN_TEXT_SIZE}px — very small text can be hard to read for many users.`,
  category: 'wcag',
  severity: 'verbose',

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    if (node.type !== 'TEXT') return [];
    if (!node.fontSize || node.fontSize >= MIN_TEXT_SIZE) return [];

    return [{
      nodeId: node.id,
      nodeName: node.name,
      rule: 'wcag-text-size',
      severity: 'verbose',
      currentValue: `${node.fontSize}px`,
      expectedValue: `>= ${MIN_TEXT_SIZE}px`,
      suggestion: `"${node.name}" is only ${node.fontSize}px — bump it to at least ${MIN_TEXT_SIZE}px for comfortable reading`,
      autoFixable: true,
      fixData: { fontSize: MIN_TEXT_SIZE },
    }];
  },
};
