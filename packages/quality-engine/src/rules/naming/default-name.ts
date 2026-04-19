/**
 * Default name rule — detect nodes with Figma's auto-generated names.
 */

import type { AbstractNode, LintContext, LintRule, LintViolation } from '../../types.js';
import { tr } from '../../types.js';

const DEFAULT_NAME_PATTERN =
  /^(Frame|Group|Rectangle|Ellipse|Line|Vector|Text|Component|Instance|Polygon|Star|Slice|Section)\s*\d*$/;

export const defaultNameRule: LintRule = {
  name: 'default-name',
  description: 'Detect layers still using Figma\'s auto-generated names like "Frame 1" or "Rectangle 2".',
  category: 'naming',
  severity: 'verbose',
  ai: {
    preventionHint:
      'Every frame must have a descriptive name reflecting its purpose (e.g. "Login Form", "Email Input") — no "Frame 1" defaults',
    phase: ['content'],
  },

  check(node: AbstractNode, ctx: LintContext): LintViolation[] {
    // Only check container-like or meaningful nodes, skip deeply nested leaves
    if (!isWorthChecking(node.type)) return [];
    if (!DEFAULT_NAME_PATTERN.test(node.name)) return [];

    return [
      {
        nodeId: node.id,
        nodeName: node.name,
        rule: 'default-name',
        severity: 'verbose',
        currentValue: node.name,
        suggestion: tr(
          ctx.lang,
          `"${node.name}" still has a default name — give it a descriptive name so the design is easier to navigate`,
          `「${node.name}」仍是默认名称——请取一个有描述性的名字,让设计更易于浏览`,
        ),
        autoFixable: false,
      },
    ];
  },
};

function isWorthChecking(type: string): boolean {
  // Check frames, groups, components, instances, and top-level shapes
  return [
    'FRAME',
    'GROUP',
    'COMPONENT',
    'COMPONENT_SET',
    'INSTANCE',
    'SECTION',
    'RECTANGLE',
    'ELLIPSE',
    'LINE',
    'VECTOR',
    'POLYGON',
    'STAR',
    'TEXT',
  ].includes(type);
}
