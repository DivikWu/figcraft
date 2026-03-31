/**
 * Lint engine — runs rules against abstract nodes, collects violations.
 */

import type { AbstractNode, LintContext, LintViolation, LintRule, LintCategory as LintRuleCategory, LintSeverity } from './types.js';
import { downgradeSeverity, getContextSeverity } from './types.js';
// Token / spec compliance
import { specColorRule } from './rules/spec/spec-color.js';
import { specTypographyRule } from './rules/spec/spec-typography.js';
import { specSpacingRule } from './rules/spec/spec-spacing.js';
import { specBorderRadiusRule } from './rules/spec/spec-border-radius.js';
import { hardcodedTokenRule } from './rules/spec/hardcoded-token.js';
import { noTextStyleRule } from './rules/spec/no-text-style.js';
// WCAG accessibility
import { wcagContrastRule } from './rules/wcag/wcag-contrast.js';
import { wcagTargetSizeRule } from './rules/wcag/wcag-target-size.js';
import { wcagTextSizeRule } from './rules/wcag/wcag-text-size.js';
import { wcagLineHeightRule } from './rules/wcag/wcag-line-height.js';
// Layout
import { fixedInAutolayoutRule } from './rules/layout/fixed-in-autolayout.js';
import { emptyContainerRule } from './rules/layout/empty-container.js';
import { spacerFrameRule } from './rules/layout/spacer-frame.js';
import { maxNestingDepthRule } from './rules/layout/max-nesting-depth.js';
import { textOverflowRule } from './rules/layout/text-overflow.js';
import { overflowParentRule } from './rules/layout/overflow-parent.js';
import { unboundedHugRule } from './rules/layout/unbounded-hug.js';
import { noAutolayoutRule } from './rules/layout/no-autolayout.js';
import { sectionSpacingCollapseRule } from './rules/layout/section-spacing-collapse.js';
import { mobileDimensionsRule } from './rules/layout/mobile-dimensions.js';
import { systemBarFullbleedRule } from './rules/layout/system-bar-fullbleed.js';
import { screenBottomOverflowRule } from './rules/layout/screen-bottom-overflow.js';
// Structure
import { buttonStructureRule } from './rules/structure/button-structure.js';
import { inputFieldStructureRule } from './rules/structure/input-field-structure.js';
import { formConsistencyRule } from './rules/structure/form-consistency.js';
import { ctaWidthInconsistentRule } from './rules/structure/cta-width-inconsistent.js';
import { headerFragmentedRule } from './rules/structure/header-fragmented.js';
import { headerOutOfBandRule } from './rules/structure/header-out-of-band.js';
import { screenShellInvalidRule } from './rules/structure/screen-shell-invalid.js';
import { socialRowCrampedRule } from './rules/structure/social-row-cramped.js';
import { navOvercrowdedRule } from './rules/structure/nav-overcrowded.js';
import { statsRowCrampedRule } from './rules/structure/stats-row-cramped.js';
import { rootMisclassifiedInteractiveRule } from './rules/structure/root-misclassified-interactive.js';
import { nestedInteractiveShellRule } from './rules/structure/nested-interactive-shell.js';
import { componentBindingsRule } from './rules/structure/component-bindings.js';
// Naming
import { defaultNameRule } from './rules/naming/default-name.js';

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
  inputFieldStructureRule,
  mobileDimensionsRule,
  systemBarFullbleedRule,
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
  /** Rule names to skip (used to avoid re-checking rules already handled by pre-creation validation). */
  skipRules?: Set<string>;
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
  if (options.skipRules && options.skipRules.size > 0) {
    activeRules = activeRules.filter((r) => !options.skipRules!.has(r.name));
  }

  // Determine if token context is sparse (no tokens loaded) — triggers severity downgrade
  const hasTokens = ctx.colorTokens.size > 0 || ctx.spacingTokens.size > 0 ||
    ctx.radiusTokens.size > 0 || ctx.typographyTokens.size > 0;
  const hasLibrary = ctx.mode === 'library' && !!ctx.selectedLibrary;
  // Token rules get downgraded when running without token context AND without a library
  const shouldDowngradeTokenRules = !hasTokens && !hasLibrary;

  // Severity filter (5-level: error=0, unsafe=1, heuristic=2, style=3, verbose=4)
  const SEVERITY_RANK: Record<LintSeverity, number> = { error: 0, unsafe: 1, heuristic: 2, style: 3, verbose: 4 };
  const minRank = options.minSeverity ? SEVERITY_RANK[options.minSeverity] : 3; // default: up to 'style' (excludes verbose)

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
        // Context-aware severity: leaf nodes and small nodes get downgraded
        const contextSev = getContextSeverity(v.severity, node);
        if (contextSev !== v.severity) {
          if (!v.baseSeverity) v.baseSeverity = v.severity;
          v.severity = contextSev;
        }
        // Generate structured fix call for AI agents
        if (v.autoFixable && !v.fixCall) {
          v.fixCall = generateFixCall(v);
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
  const bySeverity: Record<LintSeverity, number> = { error: 0, unsafe: 0, heuristic: 0, style: 0, verbose: 0 };
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

/**
 * Generate a structured fixCall from violation data.
 * Maps known rule + fixData patterns to MCP tool calls the AI can execute directly.
 */
function generateFixCall(v: LintViolation): LintViolation['fixCall'] {
  if (!v.autoFixable || !v.fixData) return undefined;

  const nodeId = v.nodeId;

  switch (v.rule) {
    case 'no-autolayout':
      return {
        tool: 'nodes',
        params: { method: 'update', nodeId, props: { layoutMode: v.fixData.layoutMode } },
      };

    case 'spec-color':
      if (v.fixData.property === 'fills' && v.fixData.tokenName) {
        return {
          tool: 'nodes',
          params: { method: 'update', nodeId, props: { fillVariableName: v.fixData.tokenName } },
        };
      }
      if (v.fixData.property === 'strokes' && v.fixData.tokenName) {
        return {
          tool: 'nodes',
          params: { method: 'update', nodeId, props: { strokeVariableName: v.fixData.tokenName } },
        };
      }
      break;

    case 'hardcoded-token':
      if (v.fixData.property === 'fills') {
        return {
          tool: 'nodes',
          params: { method: 'update', nodeId, props: { fillVariableName: '__auto__' } },
        };
      }
      if (v.fixData.property === 'cornerRadius') {
        return {
          tool: 'nodes',
          params: { method: 'update', nodeId, props: { cornerRadiusVariableName: '__auto__' } },
        };
      }
      break;

    case 'wcag-line-height':
      if (v.fixData.lineHeight != null) {
        return {
          tool: 'text',
          params: { method: 'set_content', nodeId, lineHeight: v.fixData.lineHeight },
        };
      }
      break;

    case 'spacer-frame':
      return {
        tool: 'nodes',
        params: { method: 'delete', nodeId },
      };

    case 'unbounded-hug':
      if (v.fixData.fix === 'stretch-self') {
        return {
          tool: 'nodes',
          params: { method: 'update', nodeId, props: { layoutAlign: 'STRETCH' } },
        };
      }
      break;

    case 'wcag-text-size':
      return {
        tool: 'nodes',
        params: { method: 'update', nodeId, props: { fontSize: 12 } },
      };

    case 'text-overflow':
      if (v.fixData.textAutoResize) {
        return {
          tool: 'nodes',
          params: { method: 'update', nodeId, props: { textAutoResize: v.fixData.textAutoResize } },
        };
      }
      break;

    case 'overflow-parent':
      if (v.fixData.fix === 'stretch') {
        return {
          tool: 'nodes',
          params: { method: 'update', nodeId, props: { layoutAlign: 'STRETCH' } },
        };
      }
      break;

    case 'section-spacing-collapse':
      if (v.fixData.itemSpacing != null) {
        return {
          tool: 'nodes',
          params: { method: 'update', nodeId, props: { itemSpacing: v.fixData.itemSpacing } },
        };
      }
      break;
  }

  return undefined;
}

/** Get all available rule names. */
export function getAvailableRules(): Array<{ name: string; description: string; category: string; severity: string }> {
  return ALL_RULES.map((r) => ({ name: r.name, description: r.description, category: r.category, severity: r.severity }));
}
