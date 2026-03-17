/**
 * no-text-property — Warn when a COMPONENT contains text children
 * that are not exposed as component TEXT properties.
 *
 * Text layers inside components should typically be exposed as TEXT properties
 * so consumers can customize content without detaching the instance.
 *
 * Category: component | Severity: info
 */

import type { AbstractNode, LintContext, LintViolation, LintRule } from '../types.js';

/** Collect all property names referenced as TEXT type from definitions. */
function getTextPropertyNames(defs: NonNullable<AbstractNode['componentPropertyDefinitions']>): Set<string> {
  const names = new Set<string>();
  for (const [key, def] of Object.entries(defs)) {
    if (def.type === 'TEXT') names.add(key);
  }
  return names;
}

/** Collect all property keys referenced by children via componentPropertyReferences. */
function collectReferencedProps(node: AbstractNode): Set<string> {
  const refs = new Set<string>();
  if (node.componentPropertyReferences) {
    for (const propName of Object.values(node.componentPropertyReferences)) {
      refs.add(propName);
    }
  }
  if (node.children) {
    for (const child of node.children) {
      for (const r of collectReferencedProps(child)) {
        refs.add(r);
      }
    }
  }
  return refs;
}

/** Find text nodes in subtree that don't reference any component property. */
function findUnexposedTextNodes(
  node: AbstractNode,
  referencedProps: Set<string>,
): AbstractNode[] {
  const result: AbstractNode[] = [];

  if (node.type === 'TEXT') {
    // Check if this text node references a component property
    const hasRef = node.componentPropertyReferences &&
      Object.values(node.componentPropertyReferences).some((ref) => referencedProps.has(ref));
    if (!hasRef) {
      result.push(node);
    }
  }

  if (node.children) {
    for (const child of node.children) {
      result.push(...findUnexposedTextNodes(child, referencedProps));
    }
  }

  return result;
}

export const noTextPropertyRule: LintRule = {
  name: 'no-text-property',
  description: 'Text layers in components should be exposed as TEXT properties',
  category: 'component',
  severity: 'info',
  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    if (node.type !== 'COMPONENT') return [];

    const defs = node.componentPropertyDefinitions ?? {};
    const textPropNames = getTextPropertyNames(defs);
    const referencedProps = collectReferencedProps(node);

    const unexposed = findUnexposedTextNodes(node, referencedProps);
    // Skip single-text components (e.g. icon labels) — only flag when there are
    // multiple text nodes or when text properties already exist but some texts are missed
    if (unexposed.length === 0) return [];
    if (unexposed.length === 1 && textPropNames.size === 0) return [];

    return unexposed.map((textNode) => ({
      nodeId: textNode.id,
      nodeName: textNode.name,
      rule: 'no-text-property',
      severity: 'info' as const,
      currentValue: textNode.characters ?? textNode.name,
      expectedValue: 'exposed as TEXT component property',
      suggestion: `Text "${textNode.name}" in component "${node.name}" is not exposed as a TEXT property`,
      autoFixable: false,
    }));
  },
};
