/**
 * Lint engine — runs rules against abstract nodes, collects violations.
 */

import { elevationConsistencyRule } from './rules/layout/elevation-consistency.js';
import { elevationHierarchyRule } from './rules/layout/elevation-hierarchy.js';
import { emptyContainerRule } from './rules/layout/empty-container.js';
// Layout
import { fixedInAutolayoutRule } from './rules/layout/fixed-in-autolayout.js';
import { maxNestingDepthRule } from './rules/layout/max-nesting-depth.js';
import { mobileDimensionsRule } from './rules/layout/mobile-dimensions.js';
import { noAutolayoutRule } from './rules/layout/no-autolayout.js';
import { overflowParentRule } from './rules/layout/overflow-parent.js';
import { screenBottomOverflowRule } from './rules/layout/screen-bottom-overflow.js';
import { sectionSpacingCollapseRule } from './rules/layout/section-spacing-collapse.js';
import { spacerFrameRule } from './rules/layout/spacer-frame.js';
import { systemBarFullbleedRule } from './rules/layout/system-bar-fullbleed.js';
import { textOverflowRule } from './rules/layout/text-overflow.js';
import { unboundedHugRule } from './rules/layout/unbounded-hug.js';
// Naming
import { defaultNameRule } from './rules/naming/default-name.js';
import { placeholderTextRule } from './rules/naming/placeholder-text.js';
import { hardcodedTokenRule } from './rules/spec/hardcoded-token.js';
import { noTextStyleRule } from './rules/spec/no-text-style.js';
import { specBorderRadiusRule } from './rules/spec/spec-border-radius.js';
// Token / spec compliance
import { specColorRule } from './rules/spec/spec-color.js';
import { specSpacingRule } from './rules/spec/spec-spacing.js';
import { specTypographyRule } from './rules/spec/spec-typography.js';
// Structure
import { buttonStructureRule } from './rules/structure/button-structure.js';
import { componentBindingsRule } from './rules/structure/component-bindings.js';
import { ctaWidthInconsistentRule } from './rules/structure/cta-width-inconsistent.js';
import { formConsistencyRule } from './rules/structure/form-consistency.js';
import { headerFragmentedRule } from './rules/structure/header-fragmented.js';
import { headerOutOfBandRule } from './rules/structure/header-out-of-band.js';
import { inputFieldStructureRule } from './rules/structure/input-field-structure.js';
import { navOvercrowdedRule } from './rules/structure/nav-overcrowded.js';
import { nestedInteractiveShellRule } from './rules/structure/nested-interactive-shell.js';
import { rootMisclassifiedInteractiveRule } from './rules/structure/root-misclassified-interactive.js';
import { screenShellInvalidRule } from './rules/structure/screen-shell-invalid.js';
import { socialRowCrampedRule } from './rules/structure/social-row-cramped.js';
import { statsRowCrampedRule } from './rules/structure/stats-row-cramped.js';
// WCAG accessibility
import { wcagContrastRule } from './rules/wcag/wcag-contrast.js';
import { wcagLineHeightRule } from './rules/wcag/wcag-line-height.js';
import { wcagNonTextContrastRule } from './rules/wcag/wcag-non-text-contrast.js';
import { wcagTargetSizeRule } from './rules/wcag/wcag-target-size.js';
import { wcagTextSizeRule } from './rules/wcag/wcag-text-size.js';
import { getRuleFrequencyOrder } from './stats.js';
import type {
  AbstractNode,
  LintContext,
  LintRule,
  LintCategory as LintRuleCategory,
  LintSeverity,
  LintViolation,
  RuleAI,
} from './types.js';
import { downgradeSeverity, getContextSeverity, SEVERITY_ORDER } from './types.js';

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
  wcagNonTextContrastRule,
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
  elevationConsistencyRule,
  elevationHierarchyRule,
  // Naming (always active)
  defaultNameRule,
  placeholderTextRule,
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
  summary: {
    total: number;
    pass: number;
    violations: number;
    truncated?: boolean;
    bySeverity: Record<LintSeverity, number>;
  };
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
export function runLint(nodes: AbstractNode[], ctx: LintContext, options: LintOptions = {}): LintReport {
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
  const hasTokens =
    ctx.colorTokens.size > 0 ||
    ctx.spacingTokens.size > 0 ||
    ctx.radiusTokens.size > 0 ||
    ctx.typographyTokens.size > 0;
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
    // Node-level lint exclusion via lintIgnore field
    const ignoreAll = node.lintIgnore === '*';
    const ignoreSet =
      !ignoreAll && node.lintIgnore ? new Set(node.lintIgnore.split(',').map((s) => s.trim())) : undefined;
    for (const rule of activeRules) {
      if (ignoreAll || ignoreSet?.has(rule.name)) continue;
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
        // Generate fix descriptor from rule, then derive fixCall
        if (v.autoFixable && !v.fixDescriptor && rule.describeFix) {
          v.fixDescriptor = rule.describeFix(v) ?? undefined;
        }
        if (v.autoFixable && !v.fixCall && v.fixDescriptor) {
          v.fixCall = generateFixCallFromDescriptor(v);
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
      // Propagate per-mode background colors for dark mode contrast checks.
      const effectiveBgModes = node.variableModeColors ?? node.parentBgModeColors;
      for (const child of node.children) {
        if (earlyExit) return;
        if (effectiveBg) child.parentBgColor = effectiveBg;
        if (effectiveBgModes) child.parentBgModeColors = effectiveBgModes;
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
 * Derive a fixCall from a FixDescriptor (new system).
 * Covers all descriptor kinds mechanically — no per-rule switch needed.
 */
function generateFixCallFromDescriptor(v: LintViolation): LintViolation['fixCall'] {
  const desc = v.fixDescriptor;
  if (!desc) return undefined;
  const nodeId = v.nodeId;
  switch (desc.kind) {
    case 'set-properties':
      return { tool: 'nodes', params: { method: 'update', nodeId, props: desc.props } };
    case 'resize':
      return {
        tool: 'nodes',
        params: {
          method: 'update',
          nodeId,
          props: {
            ...(desc.width != null ? { width: desc.width } : {}),
            ...(desc.height != null ? { height: desc.height } : {}),
          },
        },
      };
    case 'remove-and-redistribute':
      return { tool: 'nodes', params: { method: 'delete', nodeId } };
    case 'deferred':
      return undefined;
  }
}

/** Get all available rule names with optional AI metadata. */
export function getAvailableRules(): Array<{
  name: string;
  description: string;
  category: string;
  severity: string;
  autoFixable: boolean;
  ai?: RuleAI;
}> {
  return ALL_RULES.map((r) => ({
    name: r.name,
    description: r.description,
    category: r.category,
    severity: r.severity,
    autoFixable: !!r.describeFix,
    ...(r.ai ? { ai: r.ai } : {}),
  }));
}

/**
 * Generate a prevention checklist from rule AI metadata.
 * Returns an array of preventionHint strings, filtered by phase/tags/severity.
 * Used by the prompt system to derive self-review checklists from rules.
 */
export function getPreventionChecklist(options?: {
  phases?: string[];
  tags?: string[];
  minSeverity?: LintSeverity;
  /** Sort by violation frequency (most frequent first). Requires session stats from recordLintRun(). */
  sortBy?: 'frequency';
}): string[] {
  const maxIdx = options?.minSeverity ? SEVERITY_ORDER.indexOf(options.minSeverity) : SEVERITY_ORDER.indexOf('style'); // default: up to style

  const filtered = ALL_RULES.filter((r) => {
    if (!r.ai?.preventionHint) return false;
    // Severity filter
    if (SEVERITY_ORDER.indexOf(r.severity) > maxIdx) return false;
    // Phase filter
    if (options?.phases?.length && r.ai.phase) {
      if (!r.ai.phase.some((p) => options.phases!.includes(p))) return false;
    }
    // Tag filter
    if (options?.tags?.length && r.ai.tags) {
      if (!r.ai.tags.some((t) => options.tags!.includes(t))) return false;
    }
    return true;
  });

  // Sort by violation frequency if requested (high-frequency rules first)
  if (options?.sortBy === 'frequency') {
    const freqOrder = getRuleFrequencyOrder();
    const freqMap = new Map(freqOrder.map((name, idx) => [name, idx]));
    filtered.sort((a, b) => {
      const aIdx = freqMap.get(a.name) ?? Infinity;
      const bIdx = freqMap.get(b.name) ?? Infinity;
      return aIdx - bIdx;
    });
  }

  return filtered.map((r) => r.ai!.preventionHint);
}

// ─── Preflight audit ───

/**
 * Map lint violations to designPreflight categories.
 * Returns a compact audit object showing pass/warn/fail per category.
 */
export type PreflightStatus = 'pass' | 'warn' | 'fail' | 'unknown';

export interface PreflightAudit {
  colorConsistency: PreflightStatus;
  typographyBound: PreflightStatus;
  semanticNaming: PreflightStatus;
  touchTargets: PreflightStatus;
  contentRealistic: PreflightStatus;
  emptyContainers: PreflightStatus;
}

const PREFLIGHT_RULE_MAP: Record<keyof PreflightAudit, string[]> = {
  colorConsistency: ['hardcoded-token', 'spec-color'],
  typographyBound: ['no-text-style', 'spec-typography'],
  semanticNaming: ['default-name'],
  touchTargets: ['wcag-target-size', 'button-structure'],
  contentRealistic: ['placeholder-text'],
  emptyContainers: ['empty-container'],
};

/**
 * Audit a lint report against designPreflight categories.
 * @param violationsByRule Map of rule name → violation count
 */
export function auditPreflightCompliance(violationsByRule: Map<string, number>): PreflightAudit {
  const audit: PreflightAudit = {
    colorConsistency: 'pass',
    typographyBound: 'pass',
    semanticNaming: 'pass',
    touchTargets: 'pass',
    contentRealistic: 'unknown',
    emptyContainers: 'pass',
  };

  for (const [category, rules] of Object.entries(PREFLIGHT_RULE_MAP)) {
    if (rules.length === 0) continue; // unknown categories stay unknown
    const totalViolations = rules.reduce((sum, r) => sum + (violationsByRule.get(r) ?? 0), 0);
    if (totalViolations === 0) {
      (audit as unknown as Record<string, PreflightStatus>)[category] = 'pass';
    } else if (totalViolations <= 2) {
      (audit as unknown as Record<string, PreflightStatus>)[category] = 'warn';
    } else {
      (audit as unknown as Record<string, PreflightStatus>)[category] = 'fail';
    }
  }

  return audit;
}
