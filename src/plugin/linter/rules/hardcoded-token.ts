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
  description: 'Detect fill colors or corner radii that aren\'t linked to a shared library variable.',
  category: 'token',
  severity: 'warning',

  check(node: AbstractNode, ctx: LintContext): LintViolation[] {
    // Only active in library mode with a library selected
    if (ctx.mode !== 'library' || !ctx.selectedLibrary) return [];

    const violations: LintViolation[] = [];
    const bv = node.boundVariables ?? {};

    // Check fills — should be bound to a color variable
    // Skip if already bound to a paint style, or if fills are bound via variables
    if (node.fills && !node.fillStyleId) {
      const hasSolidFill = node.fills.some((f) => f.type === 'SOLID' && f.visible !== false);
      const fillsBound = bv['fills'] || (Array.isArray(bv['fills']) && bv['fills'].length > 0);
      if (hasSolidFill && !fillsBound) {
        // Skip container frames that use default white/transparent — these are structural,
        // not design surfaces. Only flag if the fill is a non-default color.
        const fill = node.fills.find((f) => f.type === 'SOLID' && f.visible !== false);
        const isDefaultWhite = fill?.color && (
          fill.color === '#ffffff' || fill.color === '#FFFFFF' ||
          fill.color.toLowerCase() === '#fff'
        );
        if (!isDefaultWhite) {
          const colorStr = fill?.color ?? 'solid';
          const opacityStr = fill?.opacity !== undefined && fill.opacity !== 1 ? ` ${Math.round(fill.opacity * 100)}%` : '';
          violations.push({
            nodeId: node.id,
            nodeName: node.name,
            rule: 'hardcoded-token',
            severity: 'warning',
            currentValue: `fills: ${colorStr}${opacityStr}`,
            suggestion: `Fill color ${colorStr}${opacityStr} is not bound to a variable — link it to the library`,
            autoFixable: true,
            fixData: { property: 'fills', hex: fill?.color ?? null, opacity: fill?.opacity ?? 1, nodeType: node.type },
          });
        }
      }
    }

    // Check corner radius
    if (node.cornerRadius !== undefined && node.cornerRadius !== 0 && !bv['cornerRadius']) {
      const radiusVal = Array.isArray(node.cornerRadius) ? node.cornerRadius.join('/') : node.cornerRadius;
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: 'hardcoded-token',
        severity: 'warning',
        currentValue: `cornerRadius: ${radiusVal}`,
        suggestion: `Corner radius ${radiusVal}px is not bound to a variable — link it to the library`,
        autoFixable: true,
        fixData: { property: 'cornerRadius', value: node.cornerRadius, nodeName: node.name },
      });
    }

    return violations;
  },
};
