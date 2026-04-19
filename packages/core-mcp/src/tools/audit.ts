/**
 * Audit tool — deep single-node quality audit combining lint + design guidelines.
 */

import type { LintSeverity } from '@figcraft/quality-engine';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Bridge } from '../bridge.js';

export function registerAuditTools(server: McpServer, bridge: Bridge): void {
  server.tool(
    'audit_node',
    'Run a deep quality audit on a single node. Combines all lint rules + design guideline checks ' +
      'into a structured report with severity, suggestions, and auto-fix availability. ' +
      'Use this for detailed inspection of a specific element before finalizing a design.',
    {
      nodeId: z.string().describe('The Figma node ID to audit'),
      categories: z
        .array(z.string())
        .optional()
        .describe('Lint categories to check: token, layout, naming, wcag, component (default: all)'),
    },
    async ({ nodeId, categories }) => {
      // Step 1: Run lint on the specific node.
      // Note: token context (library tokens / DTCG cached tokens) is resolved Plugin-side
      // from clientStorage in lint_check — no need to pass it from here.
      const lintParams: Record<string, unknown> = {
        nodeIds: [nodeId],
      };
      if (categories) lintParams.categories = categories;

      interface LintResult {
        summary: { total: number; violations: number; bySeverity: Record<string, number> };
        categories: Array<{
          rule: string;
          description: string;
          count: number;
          nodes: Array<{
            nodeId: string;
            nodeName: string;
            rule: string;
            severity: LintSeverity;
            currentValue: unknown;
            expectedValue?: unknown;
            suggestion: string;
            autoFixable: boolean;
          }>;
        }>;
      }

      let lintResult: LintResult | null = null;
      let lintError: string | undefined;

      try {
        lintResult = (await bridge.request('lint_check', {
          ...lintParams,
          maxViolations: 100,
        })) as LintResult;
      } catch (err) {
        lintError = err instanceof Error ? err.message : String(err);
      }

      // Step 2: Get node info for structural analysis (standard detail to avoid response_too_large on large nodes)
      const nodeInfo = (await bridge.request('get_node_info', { nodeId, detail: 'standard', maxDepth: 3 })) as {
        id: string;
        name: string;
        type: string;
        width?: number;
        height?: number;
        layoutMode?: string;
        children?: Array<{ id: string; name: string; type: string }>;
      };

      // Step 2b: Get variable bindings summary (eliminates need for follow-up variables_ep calls)
      let bindingsSummary: { bound: number; details: Array<{ field: string; variable: string }> } | undefined;
      try {
        const bindingsResult = (await bridge.request('get_node_variables', { nodeId })) as {
          bindings: Record<string, Array<{ name: string; resolvedType: string }>>;
        };
        const details: Array<{ field: string; variable: string }> = [];
        for (const [field, vars] of Object.entries(bindingsResult.bindings ?? {})) {
          for (const v of Array.isArray(vars) ? vars : [vars]) {
            if (v && typeof v === 'object' && 'name' in v) {
              details.push({ field, variable: (v as { name: string }).name });
            }
          }
        }
        bindingsSummary = {
          bound: details.length,
          details: details.slice(0, 20), // cap to avoid response bloat
        };
      } catch {
        /* bindings unavailable — proceed without */
      }

      // Step 2c: Get text content summary (eliminates need for follow-up text_scan calls)
      let textSummary: Array<{ name: string; content: string }> | undefined;
      try {
        const textResult = (await bridge.request('text_scan', { nodeId, limit: 20 })) as {
          texts: Array<{ name: string; characters: string }>;
        };
        if (textResult.texts?.length > 0) {
          textSummary = textResult.texts.map((t) => ({
            name: t.name,
            content: t.characters?.slice(0, 50) ?? '',
          }));
        }
      } catch {
        /* text scan unavailable */
      }

      // Step 3: Build structured audit report.
      // Severity buckets must match quality-engine LintSeverity:
      //   'error' | 'unsafe' | 'heuristic' | 'style' | 'verbose'
      const violations = lintResult?.categories?.flatMap((c) => c.nodes) ?? [];
      const errors = violations.filter((v) => v.severity === 'error');
      const unsafes = violations.filter((v) => v.severity === 'unsafe');
      const heuristics = violations.filter((v) => v.severity === 'heuristic');
      const styles = violations.filter((v) => v.severity === 'style' || v.severity === 'verbose');
      const fixable = violations.filter((v) => v.autoFixable);

      // Step 4: Structural checks beyond lint
      const structuralNotes: string[] = [];
      if (lintError) {
        structuralNotes.push(`Lint check failed: ${lintError}. Structural analysis only.`);
      }
      if (nodeInfo.type === 'FRAME' && !nodeInfo.layoutMode) {
        structuralNotes.push('Frame has no auto-layout — children may overlap.');
      }
      if (nodeInfo.children && nodeInfo.children.length > 10) {
        structuralNotes.push(
          `Frame has ${nodeInfo.children.length} direct children — consider grouping into semantic sections.`,
        );
      }

      // Score weights mirror severity ordering in quality-engine SEVERITY_ORDER
      // (error=most severe, verbose=least). Verbose rolls into 'styles' bucket per above.
      const lintAvailable = violations.length > 0 || (lintResult?.summary != null && !lintError);
      const score = lintAvailable
        ? Math.max(0, 100 - errors.length * 15 - unsafes.length * 8 - heuristics.length * 3 - styles.length * 1)
        : -1;

      const report = {
        nodeId: nodeInfo.id,
        nodeName: nodeInfo.name,
        nodeType: nodeInfo.type,
        dimensions: nodeInfo.width && nodeInfo.height ? `${nodeInfo.width}×${nodeInfo.height}` : undefined,
        qualityScore: score,
        summary: lintResult?.summary
          ? {
              totalChecked: lintResult.summary.total,
              violations: lintResult.summary.violations,
              errors: errors.length,
              unsafes: unsafes.length,
              heuristics: heuristics.length,
              styles: styles.length,
              autoFixable: fixable.length,
            }
          : { lintUnavailable: true, error: lintError },
        violations: violations.map((v) => ({
          rule: v.rule,
          severity: v.severity,
          node: v.nodeName,
          issue: v.currentValue,
          suggestion: v.suggestion,
          autoFixable: v.autoFixable,
        })),
        structuralNotes,
        bindings: bindingsSummary,
        textContent: textSummary,
        recommendation: lintError
          ? 'Lint check failed — only structural analysis available. Try lint_fix_all on the parent component set instead.'
          : errors.length > 0
            ? "Critical issues found. Run lint_fix_all to auto-fix what's possible, then address remaining errors manually."
            : unsafes.length > 0 || heuristics.length > 0
              ? 'Some quality issues detected. Consider running lint_fix_all to improve.'
              : 'Node passes quality checks.',
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(report, null, 2),
          },
        ],
      };
    },
  );
}
