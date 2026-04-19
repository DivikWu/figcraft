/**
 * Shared detection for horizontal-row overcrowding rules
 * (social-row-cramped, stats-row-cramped, nav-overcrowded).
 *
 * All three rules share the same math — required width (children + spacing + padding)
 * vs available width — and differ only in role/name detection and suggestion copy.
 */

import type { AbstractNode, FixDescriptor, LintContext, LintViolation } from '../../types.js';

export interface RowCrampedOptions {
  ruleName: string;
  detect: (node: AbstractNode) => boolean;
  buildSuggestion: (name: string, lang: 'en' | 'zh' | undefined) => string;
}

/**
 * Shared describeFix for all row-cramped rules.
 * Switching to VERTICAL auto-layout is the universally safe recovery — it turns
 * an overflowing horizontal row into a stacked list that fits any width.
 */
export function describeRowCrampedFix(v: LintViolation): FixDescriptor | null {
  if (!v.fixData) return null;
  return {
    kind: 'set-properties',
    props: { layoutMode: 'VERTICAL' },
    requireType: ['FRAME', 'COMPONENT'],
  };
}

export function checkRowCramped(node: AbstractNode, opts: RowCrampedOptions, ctx?: LintContext): LintViolation[] {
  if (node.type !== 'FRAME' && node.type !== 'COMPONENT') return [];
  if (!opts.detect(node)) return [];
  if (node.layoutMode !== 'HORIZONTAL') return [];
  if (!node.children || node.children.length < 2) return [];

  const availableWidth = node.width ?? node.parentWidth;
  if (availableWidth == null) return [];

  const spacing = node.itemSpacing ?? 0;
  const paddingLeft = node.paddingLeft ?? 0;
  const paddingRight = node.paddingRight ?? 0;
  const childWidths = node.children.map((child) => child.width).filter((width): width is number => width != null);
  if (childWidths.length !== node.children.length) return [];

  const requiredWidth =
    paddingLeft +
    paddingRight +
    childWidths.reduce((sum, width) => sum + width, 0) +
    spacing * Math.max(0, node.children.length - 1);

  if (requiredWidth <= availableWidth + 4) return [];

  const overflow = Math.round(requiredWidth - availableWidth);
  return [
    {
      nodeId: node.id,
      nodeName: node.name,
      rule: opts.ruleName,
      severity: 'heuristic',
      currentValue: `needs ${Math.round(requiredWidth)}px but only has ${Math.round(availableWidth)}px`,
      suggestion: opts.buildSuggestion(node.name, ctx?.lang),
      autoFixable: true,
      fixData: { fix: 'switch-vertical', overflow },
    },
  ];
}
