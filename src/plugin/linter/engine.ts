/**
 * Lint engine — runs rules against abstract nodes, collects violations.
 */

import type { AbstractNode, LintContext, LintViolation, LintRule } from './types.js';
import { specColorRule } from './rules/spec-color.js';
import { specTypographyRule } from './rules/spec-typography.js';
import { specSpacingRule } from './rules/spec-spacing.js';
import { specBorderRadiusRule } from './rules/spec-border-radius.js';
import { wcagContrastRule } from './rules/wcag-contrast.js';
import { wcagTargetSizeRule } from './rules/wcag-target-size.js';

const ALL_RULES: LintRule[] = [
  specColorRule,
  specTypographyRule,
  specSpacingRule,
  specBorderRadiusRule,
  wcagContrastRule,
  wcagTargetSizeRule,
];

export interface LintOptions {
  rules?: string[];
  offset?: number;
  limit?: number;
}

export interface LintReport {
  summary: { total: number; pass: number; violations: number };
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
  const activeRules = options.rules
    ? ALL_RULES.filter((r) => options.rules!.includes(r.name))
    : ALL_RULES;

  const allViolations: LintViolation[] = [];

  function walk(node: AbstractNode) {
    for (const rule of activeRules) {
      const violations = rule.check(node, ctx);
      allViolations.push(...violations);
    }
    if (node.children) {
      for (const child of node.children) {
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
    },
    categories: paginatedCategories,
    pagination,
  };
}

/** Get all available rule names. */
export function getAvailableRules(): Array<{ name: string; description: string }> {
  return ALL_RULES.map((r) => ({ name: r.name, description: r.description }));
}
