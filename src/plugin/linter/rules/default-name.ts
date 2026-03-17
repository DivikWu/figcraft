/**
 * Default name rule — detect nodes with Figma's auto-generated names.
 */

import type { AbstractNode, LintContext, LintViolation, LintRule } from '../types.js';

const DEFAULT_NAME_PATTERN = /^(Frame|Group|Rectangle|Ellipse|Line|Vector|Text|Component|Instance|Polygon|Star|Slice|Section)\s*\d*$/;

export const defaultNameRule: LintRule = {
  name: 'default-name',
  description: 'Detect nodes with default auto-generated names (e.g. "Frame 1", "Rectangle 2").',
  category: 'naming',
  severity: 'warning',

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    // Only check container-like or meaningful nodes, skip deeply nested leaves
    if (!isWorthChecking(node.type)) return [];
    if (!DEFAULT_NAME_PATTERN.test(node.name)) return [];

    return [{
      nodeId: node.id,
      nodeName: node.name,
      rule: 'default-name',
      severity: 'warning',
      currentValue: node.name,
      suggestion: `Rename "${node.name}" to a meaningful name that describes its purpose`,
      autoFixable: false,
    }];
  },
};

function isWorthChecking(type: string): boolean {
  // Check frames, groups, components, instances, and top-level shapes
  return [
    'FRAME', 'GROUP', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'SECTION',
    'RECTANGLE', 'ELLIPSE', 'LINE', 'VECTOR', 'POLYGON', 'STAR', 'TEXT',
  ].includes(type);
}
