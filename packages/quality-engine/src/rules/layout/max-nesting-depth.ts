/**
 * max-nesting-depth — Warn when node nesting exceeds a reasonable depth.
 *
 * Deep nesting makes designs hard to maintain and often indicates
 * unnecessary wrapper frames that should be flattened.
 *
 * Category: layout | Severity: hint
 */

import { DESIGN_CONSTANTS } from '../../constants.js';
import type { AbstractNode, LintContext, LintRule, LintViolation } from '../../types.js';
import { tr } from '../../types.js';

const MAX_DEPTH = DESIGN_CONSTANTS.nesting.maxDepth;

export const maxNestingDepthRule: LintRule = {
  name: 'max-nesting-depth',
  description: `Detect layers nested more than ${MAX_DEPTH} levels deep — simplifying the hierarchy makes designs easier to maintain.`,
  category: 'layout',
  severity: 'verbose',

  check(node: AbstractNode, ctx: LintContext): LintViolation[] {
    // Only check from container nodes
    if (node.type !== 'FRAME' && node.type !== 'GROUP' && node.type !== 'COMPONENT') return [];

    const violations: LintViolation[] = [];
    measureDepth(node, 1, violations, ctx.lang);
    return violations;
  },
};

function measureDepth(
  node: AbstractNode,
  currentDepth: number,
  violations: LintViolation[],
  lang: 'en' | 'zh' | undefined,
): void {
  if (!node.children) return;

  for (const child of node.children) {
    if (child.type === 'FRAME' || child.type === 'GROUP') {
      const childDepth = currentDepth + 1;
      if (childDepth > MAX_DEPTH) {
        violations.push({
          nodeId: child.id,
          nodeName: child.name,
          rule: 'max-nesting-depth',
          severity: 'verbose',
          currentValue: `depth ${childDepth}`,
          expectedValue: `<= ${MAX_DEPTH}`,
          suggestion: tr(
            lang,
            `"${child.name}" is nested ${childDepth} levels deep — try flattening the layer structure for easier editing`,
            `「${child.name}」嵌套 ${childDepth} 层——建议扁平化图层结构,编辑更方便`,
          ),
          autoFixable: false,
        });
        // Don't recurse further to avoid flooding with violations
        continue;
      }
      measureDepth(child, childDepth, violations, lang);
    }
  }
}
