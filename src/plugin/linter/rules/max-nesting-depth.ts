/**
 * max-nesting-depth — Warn when node nesting exceeds a reasonable depth.
 *
 * Deep nesting makes designs hard to maintain and often indicates
 * unnecessary wrapper frames that should be flattened.
 *
 * Category: layout | Severity: info
 */

import type { AbstractNode, LintContext, LintViolation, LintRule } from '../types.js';

const MAX_DEPTH = 6;

export const maxNestingDepthRule: LintRule = {
  name: 'max-nesting-depth',
  description: `Detect frames nested deeper than ${MAX_DEPTH} levels.`,
  category: 'layout',
  severity: 'info',

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    // Only check from container nodes
    if (node.type !== 'FRAME' && node.type !== 'GROUP' && node.type !== 'COMPONENT') return [];

    const violations: LintViolation[] = [];
    measureDepth(node, 1, violations);
    return violations;
  },
};

function measureDepth(node: AbstractNode, currentDepth: number, violations: LintViolation[]): void {
  if (!node.children) return;

  for (const child of node.children) {
    if (child.type === 'FRAME' || child.type === 'GROUP') {
      const childDepth = currentDepth + 1;
      if (childDepth > MAX_DEPTH) {
        violations.push({
          nodeId: child.id,
          nodeName: child.name,
          rule: 'max-nesting-depth',
          severity: 'info',
          currentValue: `depth ${childDepth}`,
          expectedValue: `<= ${MAX_DEPTH}`,
          suggestion: `"${child.name}" is nested ${childDepth} levels deep — consider flattening the hierarchy`,
          autoFixable: false,
        });
        // Don't recurse further to avoid flooding with violations
        continue;
      }
      measureDepth(child, childDepth, violations);
    }
  }
}
