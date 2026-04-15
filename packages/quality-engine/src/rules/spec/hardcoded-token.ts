/**
 * Hardcoded token rule — detect properties not bound to any variable.
 *
 * Unlike spec-color/spec-spacing/spec-border-radius (which check value matching),
 * this rule only checks whether a variable binding exists at all.
 * Most useful in library mode where the expectation is that all values
 * come from the shared library.
 */

import type { AbstractNode, FixDescriptor, LintContext, LintRule, LintViolation } from '../../types.js';

export const hardcodedTokenRule: LintRule = {
  name: 'hardcoded-token',
  description: "Detect fill colors or corner radii that aren't linked to a shared library variable.",
  category: 'token',
  severity: 'heuristic',
  ai: {
    preventionHint:
      'Bind fill colors with fillVariableName and corner radii with variable references from the shared library',
    phase: ['styling'],
    tags: ['color', 'radius'],
  },

  check(node: AbstractNode, ctx: LintContext): LintViolation[] {
    // Only active in library mode with a library selected
    if (ctx.mode !== 'library' || !ctx.selectedLibrary) return [];

    // Presentational containers (role:"presentation") are display scaffolding,
    // not actual UI surfaces — skip token enforcement.
    if (node.role === 'presentation') return [];

    const violations: LintViolation[] = [];
    const bv = node.boundVariables ?? {};

    // Check fills — should be bound to a color variable
    // Skip if already bound to a paint style, or if fills are bound via variables
    //
    // TODO(plan elegant-wandering-raven C3): users have reported false positives where
    // a node IS bound (verified via variables_ep.get_bindings) but this rule still
    // reports "hardcoded fill". Investigation hypothesis: AbstractNode serialization
    // may be dropping `boundVariables` between Plugin → quality-engine, so by the
    // time this rule runs the binding is invisible. Fix needs a focused repro on
    // the 2026-04 Button case before touching the rule itself. Note that the
    // boolean expression below is also subtly incorrect — `[] || (...)` short-
    // circuits on truthy empty array — but the direction of the bug doesn't match
    // the user-reported false positive, so the real cause is upstream.
    if (node.fills && !node.fillStyleId) {
      const hasSolidFill = node.fills.some((f) => f.type === 'SOLID' && f.visible !== false);
      const fillsBound = bv.fills || (Array.isArray(bv.fills) && bv.fills.length > 0);
      if (hasSolidFill && !fillsBound) {
        // Skip container frames that use default white/transparent — these are structural,
        // not design surfaces. Only flag if the fill is a non-default color.
        const fill = node.fills.find((f) => f.type === 'SOLID' && f.visible !== false);
        const isDefaultWhite =
          fill?.color && (fill.color === '#ffffff' || fill.color === '#FFFFFF' || fill.color.toLowerCase() === '#fff');
        if (!isDefaultWhite) {
          const colorStr = fill?.color ?? 'solid';
          const opacityStr =
            fill?.opacity !== undefined && fill.opacity !== 1 ? ` ${Math.round(fill.opacity * 100)}%` : '';
          violations.push({
            nodeId: node.id,
            nodeName: node.name,
            rule: 'hardcoded-token',
            severity: 'heuristic',
            currentValue: `fills: ${colorStr}${opacityStr}`,
            suggestion: `Fill color ${colorStr}${opacityStr} is not bound to a variable — link it to the library`,
            autoFixable: true,
            fixData: { property: 'fills', hex: fill?.color ?? null, opacity: fill?.opacity ?? 1, nodeType: node.type },
          });
        }
      }
    }

    // Check corner radius
    if (node.cornerRadius !== undefined && node.cornerRadius !== 0 && !bv.cornerRadius) {
      const radiusVal = Array.isArray(node.cornerRadius) ? node.cornerRadius.join('/') : node.cornerRadius;
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: 'hardcoded-token',
        severity: 'heuristic',
        currentValue: `cornerRadius: ${radiusVal}`,
        suggestion: `Corner radius ${radiusVal}px is not bound to a variable — link it to the library`,
        autoFixable: true,
        fixData: { property: 'cornerRadius', value: node.cornerRadius, nodeName: node.name },
      });
    }

    return violations;
  },

  describeFix(v): FixDescriptor | null {
    if (!v.fixData) return null;
    const prop = v.fixData.property as string;
    if (prop === 'fills') {
      return {
        kind: 'deferred',
        strategy: 'library-color-bind',
        data: { hex: v.fixData.hex, opacity: v.fixData.opacity, nodeType: v.fixData.nodeType },
      };
    }
    if (prop === 'cornerRadius') {
      return {
        kind: 'deferred',
        strategy: 'library-radius-bind',
        data: { value: v.fixData.value, nodeName: v.fixData.nodeName },
      };
    }
    return null;
  },
};
