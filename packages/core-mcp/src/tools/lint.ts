/**
 * Lint tools — MCP wrappers for check, fix, and rules.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';
import { compactResponse } from './response-helpers.js';
import { HEAVY_REQUEST_TIMEOUT_MS } from '@figcraft/shared';
import { getStats, recordLintRun } from '@figcraft/quality-engine';

/** Load cached tokens and build a token context for lint rules. */
async function loadTokenContext(bridge: Bridge, useStoredTokens?: string): Promise<Record<string, unknown> | undefined> {
  if (!useStoredTokens) return undefined;
  const cached = await bridge.request('load_spec_tokens', { name: useStoredTokens }) as {
    tokens?: Array<{ path: string; type: string; value: unknown }>;
    error?: string;
  };
  return cached.tokens ? buildTokenContext(cached.tokens) : undefined;
}

export function registerLintTools(server: McpServer, bridge: Bridge): void {
  server.tool(
    'lint_check',
    'Run design lint rules on selected nodes or the current page. ' +
      'Checks colors, typography, spacing, border radius against tokens, ' +
      'and WCAG contrast/target-size compliance. ' +
      'TIP: For a one-step check+fix, use lint_fix_all instead. ' +
      'If using lint_check separately, call lint_fix next with the autoFixable violations.',
    {
      nodeIds: z.array(z.string()).optional().describe('Node IDs to lint (default: selection or page)'),
      rules: z.array(z.string()).optional().describe('Rule names to run (default: all)'),
      categories: z.array(z.string()).optional().describe('Rule categories to run: token, layout, naming, wcag, component'),
      offset: z.number().optional().describe('Pagination offset'),
      limit: z.number().optional().describe('Pagination limit'),
      maxViolations: z.number().optional().describe('Stop after collecting this many violations (performance optimization for large pages)'),
      annotate: z.boolean().optional().describe('Add annotations to violated nodes in Figma'),
      useStoredTokens: z.string().optional().describe('Name of cached token set to use'),
      minSeverity: z.enum(['error', 'unsafe', 'heuristic', 'style', 'verbose']).optional().describe('Minimum severity to include (default: all). Use "warning" to hide hints/info.'),
    },
    async ({ nodeIds, rules, categories, offset, limit, maxViolations, annotate, useStoredTokens, minSeverity }) => {
      const tokenContext = await loadTokenContext(bridge, useStoredTokens);

      const result = await bridge.request('lint_check', {
        nodeIds,
        rules,
        categories,
        offset,
        limit,
        maxViolations,
        annotate,
        tokenContext,
        minSeverity,
      });

      // Record stats for frequency tracking
      try {
        const r = result as { categories?: Array<{ rule: string; nodes: Array<{ rule: string; autoFixable?: boolean }> }> };
        if (r.categories) {
          const violations = r.categories.flatMap(c => c.nodes.map(n => ({ rule: c.rule ?? (n as Record<string, unknown>).rule as string, autoFixable: n.autoFixable })));
          const rulesChecked = r.categories.map(c => c.rule);
          recordLintRun(violations, rulesChecked);
        }
      } catch { /* stats are best-effort */ }

      return compactResponse(result);
    },
  );

  server.tool(
    'lint_fix',
    'Auto-fix lint violations that are marked as autoFixable. ' +
      'Pass the violations array from a lint_check result.',
    {
      violations: z.array(z.object({
        nodeId: z.string(),
        nodeName: z.string(),
        rule: z.string(),
        severity: z.enum(['error', 'unsafe', 'heuristic', 'style', 'verbose']).optional(),
        baseSeverity: z.enum(['error', 'unsafe', 'heuristic', 'style', 'verbose']).optional(),
        currentValue: z.unknown(),
        expectedValue: z.unknown().optional(),
        suggestion: z.string(),
        autoFixable: z.boolean(),
        fixData: z.record(z.unknown()).optional(),
      })).describe('Violations to fix (from lint_check result)'),
    },
    async ({ violations }) => {
      const fixable = violations.filter((v) => v.autoFixable);
      const result = await bridge.request('lint_fix', { violations: fixable });
      return compactResponse(result);
    },
  );

  server.tool(
    'lint_fix_all',
    'Run lint on the page/selection, then auto-fix all fixable violations in one call. ' +
      'Returns the lint report and fix results. Equivalent to lint_check + lint_fix. ' +
      'Use dryRun: true to preview fixable violations without applying any changes.',
    {
      nodeIds: z.array(z.string()).optional().describe('Node IDs to lint (default: selection or page)'),
      rules: z.array(z.string()).optional().describe('Rule names to run (default: all)'),
      categories: z.array(z.string()).optional().describe('Rule categories: token, layout, naming, wcag, component'),
      useStoredTokens: z.string().optional().describe('Name of cached token set to use'),
      annotate: z.boolean().optional().describe('Add annotations to remaining (unfixable) violations'),
      maxViolations: z.number().optional().describe('Stop collecting after this many violations (performance optimization for large pages)'),
      dryRun: z.boolean().optional().describe('Preview mode: return fixable violations without applying fixes'),
    },
    async ({ nodeIds, rules, categories, useStoredTokens, annotate, maxViolations, dryRun }) => {
      const tokenContext = await loadTokenContext(bridge, useStoredTokens);

      // Step 1: lint_check
      const report = await bridge.request('lint_check', {
        nodeIds, rules, categories, tokenContext, maxViolations,
      }, HEAVY_REQUEST_TIMEOUT_MS) as {
        summary: { total: number; pass: number; violations: number; bySeverity?: Record<string, number> };
        categories: Array<{ rule: string; nodes: Array<Record<string, unknown>> }>;
      };

      // Step 2: collect fixable violations
      const allViolations: Array<Record<string, unknown>> = [];
      for (const cat of report.categories) {
        for (const v of cat.nodes) {
          allViolations.push(v);
        }
      }
      const fixable = allViolations.filter((v) => v.autoFixable);

      // dryRun: return preview without applying fixes
      if (dryRun) {
        const preview = fixable.map((v) => ({
          nodeId: v.nodeId, nodeName: v.nodeName,
          rule: v.rule, severity: v.severity,
          suggestion: v.suggestion,
          fixData: v.fixData,
        }));
        return compactResponse({
          dryRun: true,
          lint: report.summary,
          fixable: fixable.length,
          preview,
        });
      }

      let fixResult = { fixed: 0, failed: 0, errors: [] as unknown[] };
      if (fixable.length > 0) {
        fixResult = await bridge.request('lint_fix', { violations: fixable }) as typeof fixResult;
      }

      // Step 3: optionally annotate remaining
      if (annotate) {
        // Clear previous lint annotations before adding new ones
        await bridge.request('clear_annotations', { nodeIds });
        await bridge.request('lint_check', {
          nodeIds, rules, categories, tokenContext, annotate: true,
        });
      }

      // Collect remaining violations with fixCall for AI follow-up
      const remainingCount = report.summary.violations - fixResult.fixed;
      const remainingWithFixCall: Array<Record<string, unknown>> = [];
      if (remainingCount > 0) {
        for (const cat of report.categories) {
          for (const v of cat.nodes) {
            if (v.fixCall && !v.autoFixable) {
              remainingWithFixCall.push({
                nodeId: v.nodeId, nodeName: v.nodeName,
                rule: v.rule, severity: v.severity,
                suggestion: v.suggestion,
                fixCall: v.fixCall,
              });
            }
          }
        }
      }

      // Record stats for frequency tracking
      try {
        const violations = allViolations.map(v => ({ rule: v.rule as string, autoFixable: v.autoFixable as boolean | undefined }));
        const rulesChecked = report.categories.map(c => c.rule);
        recordLintRun(violations, rulesChecked);
      } catch { /* stats are best-effort */ }

      const result: Record<string, unknown> = {
        lint: report.summary,
        fixable: fixable.length,
        fixed: fixResult.fixed,
        fixFailed: fixResult.failed,
        remaining: remainingCount,
      };
      if (remainingWithFixCall.length > 0) {
        result.remainingFixCalls = remainingWithFixCall.slice(0, 10);
      }

      return compactResponse(result);
    },
  );

  server.tool(
    'set_lint_ignore',
    'Set lint rule exclusions on a specific node. ' +
      'Use to prevent specific lint rules from flagging a node (e.g. decorative elements that should not be treated as buttons). ' +
      'Pass rules as comma-separated names or "*" to exclude all rules. Pass empty string to clear.',
    {
      nodeId: z.string().describe('Node ID to set lint exclusion on'),
      rules: z.string().describe('Comma-separated rule names to ignore (e.g. "button-structure,wcag-target-size") or "*" for all. Empty string to clear.'),
    },
    async ({ nodeId, rules }) => {
      const result = await bridge.request('set_lint_ignore', { nodeId, rules });
      return compactResponse(result);
    },
  );

  server.tool(
    'compliance_report',
    'Generate a comprehensive design system compliance report. ' +
      'Combines lint results (by category), component audit, and token coverage into a single report. ' +
      'Use for design reviews and handoff documentation.',
    {
      nodeIds: z.array(z.string()).optional().describe('Scope to specific nodes (default: entire page)'),
      useStoredTokens: z.string().optional().describe('Name of cached token set for lint'),
    },
    async ({ nodeIds, useStoredTokens }) => {
      const tokenContext = await loadTokenContext(bridge, useStoredTokens);

      const lintReport = await bridge.request('lint_check', {
        nodeIds, tokenContext,
      }) as {
        summary: { total: number; pass: number; violations: number; bySeverity?: Record<string, number> };
        categories: Array<{ rule: string; description: string; count: number; nodes: Array<{ severity?: string }> }>;
      };

      // Group lint by category
      const lintByCategory: Record<string, { count: number; rules: string[] }> = {};
      for (const cat of lintReport.categories) {
        const ruleCategory = cat.rule.startsWith('wcag') ? 'wcag'
          : cat.rule.startsWith('spec-') || cat.rule === 'hardcoded-token' || cat.rule === 'no-text-style' ? 'token'
          : cat.rule.startsWith('component') || cat.rule === 'no-text-property' ? 'component'
          : cat.rule === 'default-name' || cat.rule === 'stale-text-name' ? 'naming'
          : 'layout';
        if (!lintByCategory[ruleCategory]) lintByCategory[ruleCategory] = { count: 0, rules: [] };
        lintByCategory[ruleCategory].count += cat.count;
        lintByCategory[ruleCategory].rules.push(`${cat.rule} (${cat.count})`);
      }

      // 2. Component audit
      const audit = await bridge.request('audit_components', { nodeIds }) as {
        summary: { totalComponents: number; totalIssues: number };
        issues: Array<{ nodeId: string; name: string; issue: string }>;
      };

      // 3. Compute scores
      const lintScore = lintReport.summary.total > 0
        ? Math.round((lintReport.summary.pass / lintReport.summary.total) * 100)
        : 100;
      const componentScore = audit.summary.totalComponents > 0
        ? Math.max(0, Math.round(100 - (audit.summary.totalIssues / audit.summary.totalComponents) * 25))
        : 100;
      const overallScore = Math.round((lintScore + componentScore) / 2);

      const report = {
        overallScore,
        lint: {
          score: lintScore,
          nodesChecked: lintReport.summary.total,
          passed: lintReport.summary.pass,
          violations: lintReport.summary.violations,
          bySeverity: lintReport.summary.bySeverity,
          byCategory: lintByCategory,
        },
        components: {
          score: componentScore,
          total: audit.summary.totalComponents,
          issues: audit.summary.totalIssues,
          topIssues: audit.issues.slice(0, 20),
        },
      };

      return compactResponse(report);
    },
  );

  // ─── Lint stats tool ───
  server.tool(
    'lint_stats',
    'Show lint rule violation statistics for the current session. ' +
      'Tracks how often each rule triggers, helping identify which design patterns ' +
      'cause the most issues. Use sortBy:"frequency" to see the most violated rules first.',
    {
      sortBy: z.enum(['frequency', 'name']).optional()
        .describe('Sort order: frequency (most violations first, default) or name (alphabetical)'),
    },
    async ({ sortBy = 'frequency' }) => {
      const stats = getStats(sortBy === 'frequency' ? 'frequency' : undefined);
      const entries = Object.entries(stats);
      if (entries.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: 'No lint stats yet. Run lint_check or lint_fix_all first to start collecting statistics.',
          }],
        };
      }
      return compactResponse({
        sessionStats: stats,
        summary: {
          totalRuns: Math.max(...entries.map(([, e]) => e.totalChecks)),
          totalViolations: entries.reduce((sum, [, e]) => sum + e.totalViolations, 0),
          totalAutoFixed: entries.reduce((sum, [, e]) => sum + e.autoFixed, 0),
          topViolators: entries
            .filter(([, e]) => e.totalViolations > 0)
            .sort(([, a], [, b]) => b.totalViolations - a.totalViolations)
            .slice(0, 5)
            .map(([name, e]) => `${name}: ${e.totalViolations}`),
        },
      });
    },
  );
}

export function buildTokenContext(tokens: Array<{ path: string; type: string; value: unknown }>): Record<string, unknown> {
  const colorTokens: Record<string, string> = {};
  const spacingTokens: Record<string, number> = {};
  const radiusTokens: Record<string, number> = {};
  const typographyTokens: Record<string, unknown> = {};

  for (const t of tokens) {
    const name = t.path.replace(/\./g, '/');
    switch (t.type) {
      case 'color':
        if (typeof t.value === 'string') colorTokens[name] = t.value;
        break;
      case 'dimension':
      case 'number': {
        const num = typeof t.value === 'number' ? t.value : parseFloat(String(t.value));
        if (t.path.includes('spacing') || t.path.includes('gap') || t.path.includes('padding')) {
          spacingTokens[name] = num;
        } else if (t.path.includes('radius') || t.path.includes('corner')) {
          radiusTokens[name] = num;
        }
        break;
      }
      case 'typography':
        typographyTokens[name] = t.value;
        break;
    }
  }

  return { colorTokens, spacingTokens, radiusTokens, typographyTokens, variableIds: {} };
}
