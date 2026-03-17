/**
 * Lint engine — runs rules against abstract nodes, collects violations.
 */

import type { AbstractNode, LintContext, LintViolation, LintRule, LintCategory as LintRuleCategory } from './types.js';
import { specColorRule } from './rules/spec-color.js';
import { specTypographyRule } from './rules/spec-typography.js';
import { specSpacingRule } from './rules/spec-spacing.js';
import { specBorderRadiusRule } from './rules/spec-border-radius.js';
import { wcagContrastRule } from './rules/wcag-contrast.js';
import { wcagTargetSizeRule } from './rules/wcag-target-size.js';
import { defaultNameRule } from './rules/default-name.js';
import { emptyContainerRule } from './rules/empty-container.js';
import { noTextStyleRule } from './rules/no-text-style.js';
import { wcagTextSizeRule } from './rules/wcag-text-size.js';
import { wcagLineHeightRule } from './rules/wcag-line-height.js';
import { fixedInAutolayoutRule } from './rules/fixed-in-autolayout.js';
import { hardcodedTokenRule } from './rules/hardcoded-token.js';
import { componentBindingsRule } from './rules/component-bindings.js';
import { maxNestingDepthRule } from './rules/max-nesting-depth.js';

const ALL_RULES: LintRule[] = [
  // Token compliance (require tokens/library to activate)
  specColorRule,
  specTypographyRule,
  specSpacingRule,
  specBorderRadiusRule,
  hardcodedTokenRule,
  noTextStyleRule,
  // WCAG accessibility (always active)
  wcagContrastRule,
  wcagTargetSizeRule,
  wcagTextSizeRule,
  wcagLineHeightRule,
  // Layout structure (always active)
  fixedInAutolayoutRule,
  emptyContainerRule,
  maxNestingDepthRule,
  // Naming (always active)
  defaultNameRule,
  // Component (always active)
  componentBindingsRule,
];

export interface LintOptions {
  rules?: string[];
  categories?: LintRuleCategory[];
  offset?: number;
  limit?: number;
  /** Maximum violations to collect before stopping (early-exit for large pages). */
  maxViolations?: number;
}

export interface LintReport {
  summary: { total: number; pass: number; violations: number; truncated?: boolean };
  categories: Array<{
    rule: string;
    description: string;
    count: number;
    nodes: LintViolation[];
  }>;
  pagination?: { total: number; offset: number; limit: number; hasMore: boolean };
}

/** Run lint rules on a flat list of abstract nodes. */
export function runLint(
  nodes: AbstractNode[],
  ctx: LintContext,
  options: LintOptions = {},
): LintReport {
  let activeRules = ALL_RULES;
  if (options.categories) {
    activeRules = activeRules.filter((r) => options.categories!.includes(r.category));
  }
  if (options.rules) {
    activeRules = activeRules.filter((r) => options.rules!.includes(r.name));
  }

  const allViolations: LintViolation[] = [];
  const maxV = options.maxViolations ?? Infinity;
  let earlyExit = false;

  function walk(node: AbstractNode) {
    if (earlyExit) return;
    for (const rule of activeRules) {
      const violations = rule.check(node, ctx);
      allViolations.push(...violations);
      if (allViolations.length >= maxV) {
        earlyExit = true;
        return;
      }
    }
    if (node.children) {
      for (const child of node.children) {
        if (earlyExit) return;
        walk(child);
      }
    }
  }

  for (const node of nodes) {
    walk(node);
  }

  // Group by rule
  const byRule = new Map<string, LintViolation[]>();
  for (const v of allViolations) {
    const existing = byRule.get(v.rule) ?? [];
    existing.push(v);
    byRule.set(v.rule, existing);
  }

  const categories = activeRules
    .filter((r) => byRule.has(r.name))
    .map((r) => ({
      rule: r.name,
      description: r.description,
      count: byRule.get(r.name)!.length,
      nodes: byRule.get(r.name)!,
    }));

  const totalViolations = allViolations.length;

  // Apply pagination
  const offset = options.offset ?? 0;
  const limit = options.limit ?? totalViolations;
  let paginatedCategories = categories;
  let pagination: LintReport['pagination'];

  if (options.offset !== undefined || options.limit !== undefined) {
    // Flatten, paginate, then regroup
    const sliced = allViolations.slice(offset, offset + limit);
    const slicedByRule = new Map<string, LintViolation[]>();
    for (const v of sliced) {
      const existing = slicedByRule.get(v.rule) ?? [];
      existing.push(v);
      slicedByRule.set(v.rule, existing);
    }
    paginatedCategories = activeRules
      .filter((r) => slicedByRule.has(r.name))
      .map((r) => ({
        rule: r.name,
        description: r.description,
        count: slicedByRule.get(r.name)!.length,
        nodes: slicedByRule.get(r.name)!,
      }));
    pagination = {
      total: totalViolations,
      offset,
      limit,
      hasMore: offset + limit < totalViolations,
    };
  }

  // Count total nodes checked (approximate by counting unique nodeIds)
  const checkedNodeIds = new Set<string>();
  function countNodes(node: AbstractNode) {
    checkedNodeIds.add(node.id);
    node.children?.forEach(countNodes);
  }
  nodes.forEach(countNodes);

  return {
    summary: {
      total: checkedNodeIds.size,
      pass: checkedNodeIds.size - new Set(allViolations.map((v) => v.nodeId)).size,
      violations: totalViolations,
      ...(earlyExit ? { truncated: true } : {}),
    },
    categories: paginatedCategories,
    pagination,
  };
}

/** Get all available rule names. */
export function getAvailableRules(): Array<{ name: string; description: string; category: string; severity: string }> {
  return ALL_RULES.map((r) => ({ name: r.name, description: r.description, category: r.category, severity: r.severity }));
}
