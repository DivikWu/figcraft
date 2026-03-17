/**
 * Hardcoded token rule — detect properties not bound to any variable.
 *
 * Unlike spec-color/spec-spacing/spec-border-radius (which check value matching),
 * this rule only checks whether a variable binding exists at all.
 * Most useful in library mode where the expectation is that all values
 * come from the shared library.
 */

import type { AbstractNode, LintContext, LintViolation, LintRule } from '../types.js';

export const hardcodedTokenRule: LintRule = {
  name: 'hardcoded-token',
  description: 'Detect properties with hardcoded values not bound to any variable (library mode).',
  category: 'token',
  severity: 'warning',

  check(node: AbstractNode, ctx: LintContext): LintViolation[] {
    // Only active in library mode
    if (ctx.mode !== 'library') return [];

    const violations: LintViolation[] = [];
    const bv = node.boundVariables ?? {};

    // Check fills — should be bound to a color variable
    if (node.fills && !node.fillStyleId) {
      const hasSolidFill = node.fills.some((f) => f.type === 'SOLID' && f.visible !== false);
      if (hasSolidFill && !bv['fills']) {
        violations.push({
          nodeId: node.id,
          nodeName: node.name,
          rule: 'hardcoded-token',
          severity: 'warning',
          currentValue: 'fills: no variable binding',
          suggestion: `"${node.name}" has hardcoded fill color — bind to a library variable`,
          autoFixable: false,
        });
      }
    }

    // Check corner radius
    if (node.cornerRadius !== undefined && node.cornerRadius !== 0 && !bv['cornerRadius']) {
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: 'hardcoded-token',
        severity: 'warning',
        currentValue: `cornerRadius: ${node.cornerRadius}`,
        suggestion: `"${node.name}" has hardcoded corner radius — bind to a library variable`,
        autoFixable: false,
      });
    }

    // Check spacing (only for auto-layout frames)
    if (node.layoutMode && node.layoutMode !== 'NONE') {
      if (node.itemSpacing && node.itemSpacing > 0 && !bv['itemSpacing']) {
        violations.push({
          nodeId: node.id,
          nodeName: node.name,
          rule: 'hardcoded-token',
          severity: 'warning',
          currentValue: `itemSpacing: ${node.itemSpacing}`,
          suggestion: `"${node.name}" has hardcoded gap — bind to a library variable`,
          autoFixable: false,
        });
      }
    }

    return violations;
  },
};
