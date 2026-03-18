/**
 * component-bindings — Warn when a COMPONENT defines text/boolean properties
 * but child nodes don't reference them (unused component properties).
 *
 * Category: component | Severity: warning
 */

import type { AbstractNode, LintContext, LintViolation, LintRule } from '../types.js';

/** Collect all componentPropertyReferences values from the subtree. */
function collectReferences(node: AbstractNode): Set<string> {
  const refs = new Set<string>();
  if (node.componentPropertyReferences) {
    for (const propName of Object.values(node.componentPropertyReferences)) {
      refs.add(propName);
    }
  }
  if (node.children) {
    for (const child of node.children) {
      for (const r of collectReferences(child)) {
        refs.add(r);
      }
    }
  }
  return refs;
}

export const componentBindingsRule: LintRule = {
  name: 'component-bindings',
  description: 'Detect component properties that are defined but not connected to any child layer.',
  category: 'component',
  severity: 'warning',
  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    // Only check COMPONENT nodes with property definitions
    if (node.type !== 'COMPONENT' || !node.componentPropertyDefinitions) return [];

    const defs = node.componentPropertyDefinitions;
    const defKeys = Object.keys(defs);
    if (defKeys.length === 0) return [];

    // Variant properties are used by the COMPONENT_SET parent, not children — skip them
    const nonVariantKeys = defKeys.filter((k) => defs[k].type !== 'VARIANT');
    if (nonVariantKeys.length === 0) return [];

    const usedRefs = collectReferences(node);
    const violations: LintViolation[] = [];

    for (const key of nonVariantKeys) {
      if (!usedRefs.has(key)) {
        violations.push({
          nodeId: node.id,
          nodeName: node.name,
          rule: 'component-bindings',
          severity: 'warning',
          currentValue: key,
          expectedValue: 'referenced by child node',
          suggestion: `Component property "${key}" (${defs[key].type}) is defined on "${node.name}" but not connected to any child layer — remove it or wire it up`,
          autoFixable: false,
        });
      }
    }

    return violations;
  },
};
