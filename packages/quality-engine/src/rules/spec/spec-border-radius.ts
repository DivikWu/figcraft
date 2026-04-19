/**
 * Spec border radius rule — detect non-token corner radius values.
 */

import type { AbstractNode, FixDescriptor, LintContext, LintRule, LintViolation } from '../../types.js';
import { tr } from '../../types.js';

export const specBorderRadiusRule: LintRule = {
  name: 'spec-border-radius',
  description: "Detect corner radius values that don't match any radius token.",
  category: 'token',
  severity: 'error',
  ai: {
    preventionHint: 'Bind corner radius to a radius token variable instead of hardcoding pixel values',
    phase: ['styling'],
    tags: ['shape', 'frame'],
  },

  check(node: AbstractNode, ctx: LintContext): LintViolation[] {
    if (ctx.radiusTokens.size === 0) return [];
    if (node.role === 'presentation') return [];
    // Screen root frames carry cornerRadius for the physical device mockup
    // (iPhone/Android device corners) — not a design-token value. Skip them.
    if (node.role === 'screen' || node.role === 'page') return [];
    // Descendants of COMPONENT/INSTANCE: corner radius is component-author scope.
    if (node.insideComponentSubtree) return [];
    if (node.cornerRadius === undefined) return [];
    const bv = node.boundVariables ?? {};
    // Figma stores cornerRadius bindings under per-corner keys even when the UI
    // appears to bind a single uniform radius — check all 5 keys.
    if (bv.cornerRadius || bv.topLeftRadius || bv.topRightRadius || bv.bottomLeftRadius || bv.bottomRightRadius)
      return [];

    const violations: LintViolation[] = [];

    const radii = typeof node.cornerRadius === 'number' ? [node.cornerRadius] : node.cornerRadius;

    for (const radius of radii) {
      if (radius === 0) continue;

      // Check if value matches any token
      let matched = false;
      for (const [, tv] of ctx.radiusTokens) {
        if (tv === radius) {
          matched = true;
          break;
        }
      }

      if (!matched) {
        const closest = findClosestRadiusToken(radius, ctx.radiusTokens);
        if (closest) {
          violations.push({
            nodeId: node.id,
            nodeName: node.name,
            rule: 'spec-border-radius',
            severity: 'error',
            currentValue: radius,
            expectedValue: `${closest.tokenName}: ${closest.tokenValue}`,
            suggestion: tr(
              ctx.lang,
              `"${node.name}" corner radius is ${radius}px — use token "${closest.tokenName}" (${closest.tokenValue}px) instead`,
              `「${node.name}」圆角为 ${radius}px——建议使用 Token「${closest.tokenName}」(${closest.tokenValue}px)`,
            ),
            autoFixable: true,
            fixData: {
              tokenName: closest.tokenName,
              value: closest.tokenValue,
              variableId: ctx.variableIds.get(closest.tokenName),
            },
          });
        }
      }
    }

    return violations;
  },

  describeFix(v): FixDescriptor | null {
    if (!v.fixData || v.fixData.value == null) return null;
    return { kind: 'set-properties', props: { cornerRadius: v.fixData.value } };
  },
};

function findClosestRadiusToken(
  value: number,
  tokens: Map<string, number>,
): { tokenName: string; tokenValue: number } | null {
  let closest: { tokenName: string; tokenValue: number; diff: number } | null = null;
  for (const [name, tv] of tokens) {
    const diff = Math.abs(tv - value);
    if (!closest || diff < closest.diff) {
      closest = { tokenName: name, tokenValue: tv, diff };
    }
  }
  return closest;
}
