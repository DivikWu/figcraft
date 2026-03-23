/**
 * Lint engine — runs rules against abstract nodes, collects violations.
 */

import type { AbstractNode, LintContext, LintViolation, LintRule, LintCategory as LintRuleCategory, LintSeverity } from './types.js';
import { downgradeSeverity } from './types.js';
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
import { spacerFrameRule } from './rules/spacer-frame.js';
import { buttonStructureRule } from './rules/button-structure.js';
import { textOverflowRule } from './rules/text-overflow.js';
import { formConsistencyRule } from './rules/form-consistency.js';
import { overflowParentRule } from './rules/overflow-parent.js';
import { unboundedHugRule } from './rules/unbounded-hug.js';
import { noAutolayoutRule } from './rules/no-autolayout.js';
import { headerFragmentedRule } from './rules/header-fragmented.js';
import { ctaWidthInconsistentRule } from './rules/cta-width-inconsistent.js';
import { sectionSpacingCollapseRule } from './rules/section-spacing-collapse.js';
import { headerOutOfBandRule } from './rules/header-out-of-band.js';
import { screenBottomOverflowRule } from './rules/screen-bottom-overflow.js';
import { socialRowCrampedRule } from './rules/social-row-cramped.js';
import { navOvercrowdedRule } from './rules/nav-overcrowded.js';
import { statsRowCrampedRule } from './rules/stats-row-cramped.js';
import { rootMisclassifiedInteractiveRule } from './rules/root-misclassified-interactive.js';
import { nestedInteractiveShellRule } from './rules/nested-interactive-shell.js';
import { screenShellInvalidRule } from './rules/screen-shell-invalid.js';

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
  spacerFrameRule,
  maxNestingDepthRule,
  buttonStructureRule,
  textOverflowRule,
  formConsistencyRule,
  ctaWidthInconsistentRule,
  overflowParentRule,
  unboundedHugRule,
  noAutolayoutRule,
  sectionSpacingCollapseRule,
  headerFragmentedRule,
  headerOutOfBandRule,
  rootMisclassifiedInteractiveRule,
  nestedInteractiveShellRule,
  screenShellInvalidRule,
  screenBottomOverflowRule,
  socialRowCrampedRule,
  navOvercrowdedRule,
  statsRowCrampedRule,
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
  /** Minimum severity to include in results (default: all). */
  minSeverity?: LintSeverity;
}

export interface LintReport {
  summary: { total: number; pass: number; violations: number; truncated?: boolean; bySeverity: Record<LintSeverity, number> };
  categories: Array<{
    rule: string;
    description: string;
    count: number;
    nodes: LintViolation[];
  }>;
  pagination?: { total: number; offset: number; limit: number; hasMore: boolean };
}

/** Extract the first visible solid fill hex color from a node (for background propagation). */
function extractSolidFillHex(node: AbstractNode): string | undefined {
  if (!node.fills) return undefined;
  const solidFill = node.fills.find((f) => f.type === 'SOLID' && f.visible !== false && f.color);
  return solidFill?.color;
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

  // Determine if token context is sparse (no tokens loaded) — triggers severity downgrade
  const hasTokens = ctx.colorTokens.size > 0 || ctx.spacingTokens.size > 0 ||
    ctx.radiusTokens.size > 0 || ctx.typographyTokens.size > 0;
  const hasLibrary = ctx.mode === 'library' && !!ctx.selectedLibrary;
  // Token rules get downgraded when running without token context AND without a library
  const shouldDowngradeTokenRules = !hasTokens && !hasLibrary;

  // Severity filter
  const SEVERITY_RANK: Record<LintSeverity, number> = { error: 0, warning: 1, info: 2, hint: 3 };
  const minRank = options.minSeverity ? SEVERITY_RANK[options.minSeverity] : 3;

  const allViolations: LintViolation[] = [];
  const maxV = options.maxViolations ?? Infinity;
  let earlyExit = false;

  function walk(node: AbstractNode) {
    if (earlyExit) return;
    for (const rule of activeRules) {
      const violations = rule.check(node, ctx);
      // Apply context-based severity downgrade for token rules
      for (const v of violations) {
        if (shouldDowngradeTokenRules && rule.category === 'token') {
          const downgraded = downgradeSeverity(v.severity);
          if (downgraded !== v.severity) {
            v.baseSeverity = v.severity;
            v.severity = downgraded;
          }
        }
        // Filter by minimum severity
        if (SEVERITY_RANK[v.severity] <= minRank) {
          allViolations.push(v);
        }
      }
      if (allViolations.length >= maxV) {
        earlyExit = true;
        return;
      }
    }
    if (node.children) {
      // Propagate background color to children for WCAG contrast checks.
      // The nearest ancestor with a visible solid fill is the effective background.
      const nodeBg = extractSolidFillHex(node);
      const effectiveBg = nodeBg ?? node.parentBgColor;
      // Propagate parent width for text overflow checks.
      const effectiveWidth = node.width ?? node.parentWidth;
      // Propagate parent layout mode for text overflow fix strategy.
      const effectiveLayoutMode = node.layoutMode ?? node.parentLayoutMode;
      for (const child of node.children) {
        if (earlyExit) return;
        if (effectiveBg) child.parentBgColor = effectiveBg;
        if (effectiveWidth != null) child.parentWidth = effectiveWidth;
        if (effectiveLayoutMode) child.parentLayoutMode = effectiveLayoutMode;
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

  // Count violations by severity
  const bySeverity: Record<LintSeverity, number> = { error: 0, warning: 0, info: 0, hint: 0 };
  for (const v of allViolations) {
    bySeverity[v.severity]++;
  }

  return {
    summary: {
      total: checkedNodeIds.size,
      pass: checkedNodeIds.size - new Set(allViolations.map((v) => v.nodeId)).size,
      violations: totalViolations,
      bySeverity,
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
