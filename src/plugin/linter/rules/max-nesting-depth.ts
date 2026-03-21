/**
 * max-nesting-depth — Warn when node nesting exceeds a reasonable depth.
 *
 * Deep nesting makes designs hard to maintain and often indicates
 * unnecessary wrapper frames that should be flattened.
 *
 * Category: layout | Severity: hint
 */

import type { AbstractNode, LintContext, LintViolation, LintRule } from '../types.js';

const MAX_DEPTH = 6;

export const maxNestingDepthRule: LintRule = {
  name: 'max-nesting-depth',
  description: `Detect layers nested more than ${MAX_DEPTH} levels deep — simplifying the hierarchy makes designs easier to maintain.`,
  category: 'layout',
  severity: 'hint',

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
          severity: 'hint',
          currentValue: `depth ${childDepth}`,
          expectedValue: `<= ${MAX_DEPTH}`,
          suggestion: `"${child.name}" is nested ${childDepth} levels deep — try flattening the layer structure for easier editing`,
          autoFixable: false,
        });
        // Don't recurse further to avoid flooding with violations
        continue;
      }
      measureDepth(child, childDepth, violations);
    }
  }
}
