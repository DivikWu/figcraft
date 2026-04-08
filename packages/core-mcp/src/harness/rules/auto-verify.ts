/**
 * Harness Rule: auto-verify (Layer 2 — Post-Enrich)
 *
 * After successful create_frame, automatically runs lint_check and injects
 * _qualityScore + _qualityWarning into the response. AI sees quality info
 * without needing to call verify_design explicitly.
 *
 * Conditions (performance optimization):
 * - Only root-level creations (parentId == null) or nodes with role
 * - Skips dryRun
 * - items[] batch: runs once on all created nodeIds
 * - 5s timeout (best-effort, failure is silent)
 */

import type { Bridge } from '../../bridge.js';
import type { HarnessAction, HarnessRule } from '../types.js';
import { PASS } from '../types.js';

const LINT_CHECK_TIMEOUT_MS = 5_000;

interface LintSummary {
  total: number;
  pass: number;
  violations: number;
  bySeverity?: Record<string, number>;
}

interface LintReport {
  summary: LintSummary;
  categories: Array<{ rule: string; nodes: unknown[] }>;
}

/**
 * Factory: create the auto-verify rule with a bridge reference.
 * Needs bridge to call lint_check via bridge.request().
 *
 * Note: lint_check goes through the same pipeline, but auto-verify only
 * matches 'create_frame', so no recursion occurs.
 */
export function createAutoVerifyRule(bridge: Bridge): HarnessRule {
  return {
    name: 'auto-verify',
    tools: ['create_frame'],
    phase: 'post-enrich',
    priority: 70, // after content-warnings (60), before debt-remind (190)

    async execute(ctx): Promise<HarnessAction> {
      if (ctx.meta.isDryRun) return PASS;
      // Only verify root-level creations or explicitly role-d nodes
      if (!ctx.meta.isRootLevel && !ctx.params.role) return PASS;
      if (!ctx.result || typeof ctx.result !== 'object') return PASS;

      const nodeIds = extractCreatedNodeIds(ctx.result as Record<string, unknown>);
      if (nodeIds.length === 0) return PASS;

      try {
        // Call lint_check with timeout protection.
        // This goes through the pipeline but won't trigger auto-verify (tool='create_frame' only).
        const raw = await bridge.request('lint_check', { nodeIds }, LINT_CHECK_TIMEOUT_MS);

        // Guard: lint_check may return null, error object, or unexpected structure
        if (!raw || typeof raw !== 'object' || !('summary' in (raw as Record<string, unknown>))) return PASS;
        const lintReport = raw as LintReport;

        const score = computeQualityScore(lintReport.summary);
        const fields: Record<string, unknown> = {
          _qualityScore: score,
          _lintSummary: lintReport.summary,
        };

        if (lintReport.summary.violations > 0) {
          const errorCount = lintReport.summary.bySeverity?.error ?? 0;
          fields._qualityWarning =
            `⚠️ ${lintReport.summary.violations} quality issues detected` +
            (errorCount > 0 ? ` (${errorCount} errors)` : '') +
            `. Call verify_design() to see details and auto-fix.`;
        }

        return { type: 'enrich', fields };
      } catch {
        // Timeout or connection error — skip silently (best-effort)
        return PASS;
      }
    },
  };
}

/** Extract all created node IDs from a create_frame response. */
function extractCreatedNodeIds(result: Record<string, unknown>): string[] {
  // items[] batch mode
  if (Array.isArray(result.items)) {
    return (result.items as Array<{ id?: string; ok?: boolean }>)
      .filter((item) => item.ok && item.id)
      .map((item) => item.id!);
  }
  // Single node mode
  if (typeof result.id === 'string') return [result.id];
  return [];
}

function computeQualityScore(summary: LintSummary): number {
  if (summary.total === 0) return 100;
  return Math.round((summary.pass / summary.total) * 100);
}
