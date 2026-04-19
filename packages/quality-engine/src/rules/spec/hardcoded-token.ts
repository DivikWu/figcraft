/**
 * Hardcoded token rule — detect properties not bound to any variable.
 *
 * Unlike spec-color/spec-border-radius (which check value matching),
 * this rule only checks whether a variable binding exists at all.
 * Most useful in library mode where the expectation is that all values
 * come from the shared library.
 */

import type { AbstractNode, FixDescriptor, LintContext, LintRule, LintViolation } from '../../types.js';
import { tr } from '../../types.js';
import { findClosestToken } from './spec-color.js';

export const hardcodedTokenRule: LintRule = {
  name: 'hardcoded-token',
  description: "Detect fill colors or corner radii that aren't linked to a spec source (library variable, local variable, or local style).",
  category: 'token',
  severity: 'heuristic',
  ai: {
    preventionHint:
      'Bind fill colors with fillVariableName (or fillStyleName for local styles) and corner radii with variable references — never hardcode hex values or raw numbers',
    phase: ['styling'],
    tags: ['color', 'radius'],
  },

  check(node: AbstractNode, ctx: LintContext): LintViolation[] {
    // Only active in library mode with a library selected
    if (ctx.mode !== 'library' || !ctx.selectedLibrary) return [];

    // Descendants of COMPONENT/INSTANCE: token binding is the component
    // author's concern and lives at the component boundary (Selection colors /
    // instance overrides). Scanning leaf vectors inside an icon instance
    // produces N identical violations per icon — high noise, low signal.
    if (node.insideComponentSubtree) return [];

    // Presentational containers (role:"presentation") are display scaffolding,
    // not actual UI surfaces — skip token enforcement.
    if (node.role === 'presentation') return [];

    const violations: LintViolation[] = [];
    const bv = node.boundVariables ?? {};

    // Check fills — should be bound to a color variable.
    // Skip if already bound to a paint style, or if fills are bound via variables.
    //
    // Binding can live in two places:
    //   1. node.boundVariables.fills  (legacy / whole-list binding)
    //   2. fill.boundVariables.color  (modern per-paint binding — always used
    //      for TEXT fills like text/primary)
    // Both must be consulted or TEXT nodes false-positive even when bound.
    if (node.fills && !node.fillStyleId) {
      const hasSolidFill = node.fills.some((f) => f.type === 'SOLID' && f.visible !== false);
      const nodeFillsBound = Array.isArray(bv.fills) ? bv.fills.length > 0 : Boolean(bv.fills);
      const visibleSolidFills = node.fills.filter((f) => f.type === 'SOLID' && f.visible !== false);
      const allVisibleSolidFillsBound =
        visibleSolidFills.length > 0 && visibleSolidFills.every((f) => f.boundVariables?.color != null);
      const fillsBound = nodeFillsBound || allVisibleSolidFillsBound;
      if (hasSolidFill && !fillsBound) {
        const fill = node.fills.find((f) => f.type === 'SOLID' && f.visible !== false);
        const isDefaultWhite =
          fill?.color && (fill.color === '#ffffff' || fill.color === '#FFFFFF' || fill.color.toLowerCase() === '#fff');
        // If spec-color would also fire (hex matches or is close to a known token),
        // skip here — spec-color's "switch to token X" suggestion is more actionable.
        const fillHex = fill?.color;
        const matchesToken = fillHex != null && ctx.colorTokens.size > 0 && !!findClosestToken(fillHex, ctx.colorTokens);
        if (!isDefaultWhite && !matchesToken) {
          const colorStr = fill?.color ?? 'solid';
          const opacityStr =
            fill?.opacity !== undefined && fill.opacity !== 1 ? ` ${Math.round(fill.opacity * 100)}%` : '';
          violations.push({
            nodeId: node.id,
            nodeName: node.name,
            rule: 'hardcoded-token',
            severity: 'heuristic',
            currentValue: `fills: ${colorStr}${opacityStr}`,
            suggestion: tr(
              ctx.lang,
              `Fill color ${colorStr}${opacityStr} is not bound to a token — link it to a variable or style from your spec source`,
              `填充颜色 ${colorStr}${opacityStr} 未绑定到 Token——请从规范源(变量或样式)中选一个绑定`,
            ),
            autoFixable: true,
            fixData: { property: 'fills', hex: fill?.color ?? null, opacity: fill?.opacity ?? 1, nodeType: node.type },
          });
        }
      }
    }

    // Check corner radius
    // Figma's Plugin API stores cornerRadius bindings under per-corner keys
    // (topLeftRadius / topRightRadius / bottomLeftRadius / bottomRightRadius)
    // even when the UI shows a single uniform binding. Check all 5 keys.
    const radiusBound =
      bv.cornerRadius ||
      bv.topLeftRadius ||
      bv.topRightRadius ||
      bv.bottomLeftRadius ||
      bv.bottomRightRadius;
    // Screen root frames use cornerRadius for the physical device mockup frame
    // (iPhone/Android screen corners), not as a design token value — skip them.
    const isScreenLike = node.role === 'screen' || node.role === 'page';
    // INSTANCE root nodes inherit node-level bindings (cornerRadius, etc.) from
    // their master COMPONENT, but Figma's Plugin API does NOT surface those
    // inherited bindings on the instance's `boundVariables` — only paint-level
    // bindings propagate. Without access to mainComponent.boundVariables we
    // can't distinguish "inherited bound" from "truly hardcoded", so we skip
    // the check on instances and trust the component author. This mirrors the
    // existing `insideComponentSubtree` skip for descendants.
    const isInstanceBoundary = node.type === 'INSTANCE';
    if (
      node.cornerRadius !== undefined &&
      node.cornerRadius !== 0 &&
      !radiusBound &&
      !isScreenLike &&
      !isInstanceBoundary
    ) {
      // If spec-border-radius would fire on this node (radiusTokens loaded and
      // at least one angle doesn't match any token), skip — its "switch to token X"
      // suggestion is more actionable than the generic "link it to the library".
      const radii = typeof node.cornerRadius === 'number' ? [node.cornerRadius] : node.cornerRadius;
      const tokenValues = Array.from(ctx.radiusTokens.values());
      const anyNonMatching =
        ctx.radiusTokens.size > 0 && radii.some((r) => r !== 0 && !tokenValues.includes(r));
      if (anyNonMatching) {
        return violations;
      }
      const radiusVal = Array.isArray(node.cornerRadius) ? node.cornerRadius.join('/') : node.cornerRadius;
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        rule: 'hardcoded-token',
        severity: 'heuristic',
        currentValue: `cornerRadius: ${radiusVal}`,
        suggestion: tr(
          ctx.lang,
          `Corner radius ${radiusVal}px is not bound to a token — link it to a radius variable from your spec source`,
          `圆角 ${radiusVal}px 未绑定到 Token——请从规范源中选一个圆角变量绑定`,
        ),
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
