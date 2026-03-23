/**
 * No text style rule — detect text nodes without a bound text style.
 *
 * Unlike spec-typography (which checks if values match a token),
 * this rule only checks whether any text style is applied at all.
 * Most useful in library mode.
 */

import type { AbstractNode, LintContext, LintViolation, LintRule } from '../types.js';

export const noTextStyleRule: LintRule = {
  name: 'no-text-style',
  description: 'Detect text layers that don\'t use a shared text style.',
  category: 'token',
  severity: 'warning',

  check(node: AbstractNode, ctx: LintContext): LintViolation[] {
    if (node.type !== 'TEXT') return [];
    // Only meaningful when a library is selected or spec tokens are loaded
    if (ctx.mode === 'library' && !ctx.selectedLibrary) return [];
    // In spec mode, spec-typography already covers this
    if (ctx.mode === 'spec' && ctx.typographyTokens.size > 0) return [];
    if (node.textStyleId) return [];

    return [{
      nodeId: node.id,
      nodeName: node.name,
      rule: 'no-text-style',
      severity: 'warning',
      currentValue: `fontSize: ${node.fontSize ?? 'mixed'}, fontFamily: ${node.fontName?.family ?? 'unknown'}`,
      suggestion: `"${node.name}" uses custom font settings — apply a shared text style to keep typography consistent`,
      autoFixable: true,
      fixData: { fontSize: node.fontSize, fontFamily: node.fontName?.family },
    }];
  },
};
