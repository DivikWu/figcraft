/**
 * component-bindings — Warn when a COMPONENT defines text/boolean properties
 * but child nodes don't reference them (unused component properties).
 *
 * Category: component | Severity: warning
 */

import type { AbstractNode, LintContext, LintRule, LintViolation } from '../../types.js';
import { tr } from '../../types.js';

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
  severity: 'style',
  check(node: AbstractNode, ctx: LintContext): LintViolation[] {
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
          severity: 'style',
          currentValue: key,
          expectedValue: 'referenced by child node',
          suggestion: tr(
            ctx.lang,
            `Component property "${key}" (${defs[key].type}) is defined on "${node.name}" but not connected to any child layer — remove it or wire it up`,
            `组件属性「${key}」(${defs[key].type}) 在「${node.name}」上定义但未连接到任何子图层——请删除或连接`,
          ),
          autoFixable: false,
        });
      }
    }

    return violations;
  },
};
