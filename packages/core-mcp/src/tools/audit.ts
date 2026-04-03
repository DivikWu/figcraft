/**
 * Audit tool — deep single-node quality audit combining lint + design guidelines.
 */

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
      includeChildren: z.boolean().optional().describe('Also audit child nodes recursively (default: true)'),
    },
    async ({ nodeId, categories, includeChildren = true }) => {
      // Step 1: Run lint on the specific node
      const lintParams: Record<string, unknown> = {
        nodeIds: [nodeId],
      };
      if (categories) lintParams.categories = categories;

      // Load token context if in library mode
      let tokenContext: Record<string, unknown> | undefined;
      try {
        const modeResult = (await bridge.request('get_mode', {})) as {
          mode: string;
          selectedLibrary: string | null;
          designContext?: { tokens?: Record<string, unknown> };
        };
        if (modeResult.mode === 'library' && modeResult.selectedLibrary) {
          lintParams.tokenContext = {};
        }
      } catch {
        /* proceed without tokens */
      }

      const lintResult = (await bridge.request('lint_check', {
        ...lintParams,
        tokenContext,
        maxViolations: 100,
      })) as {
        summary: { total: number; violations: number; bySeverity: Record<string, number> };
        categories: Array<{
          rule: string;
          description: string;
          count: number;
          nodes: Array<{
            nodeId: string;
            nodeName: string;
            rule: string;
            severity: string;
            currentValue: unknown;
            expectedValue?: unknown;
            suggestion: string;
            autoFixable: boolean;
          }>;
        }>;
      };

      // Step 2: Get node info for structural analysis
      const nodeInfo = (await bridge.request('get_node_info', { nodeId })) as {
        id: string;
        name: string;
        type: string;
        width?: number;
        height?: number;
        layoutMode?: string;
        children?: Array<{ id: string; name: string; type: string }>;
      };

      // Step 3: Build structured audit report
      const violations = lintResult.categories.flatMap((c) => c.nodes);
      const errors = violations.filter((v) => v.severity === 'error');
      const warnings = violations.filter((v) => v.severity === 'warning');
      const infos = violations.filter((v) => v.severity === 'info' || v.severity === 'hint');
      const fixable = violations.filter((v) => v.autoFixable);

      // Step 4: Structural checks beyond lint
      const structuralNotes: string[] = [];
      if (nodeInfo.type === 'FRAME' && !nodeInfo.layoutMode) {
        structuralNotes.push('Frame has no auto-layout — children may overlap.');
      }
      if (nodeInfo.children && nodeInfo.children.length > 10) {
        structuralNotes.push(
          `Frame has ${nodeInfo.children.length} direct children — consider grouping into semantic sections.`,
        );
      }

      const score = Math.max(0, 100 - errors.length * 15 - warnings.length * 5 - infos.length * 1);

      const report = {
        nodeId: nodeInfo.id,
        nodeName: nodeInfo.name,
        nodeType: nodeInfo.type,
        dimensions: nodeInfo.width && nodeInfo.height ? `${nodeInfo.width}×${nodeInfo.height}` : undefined,
        qualityScore: score,
        summary: {
          totalChecked: lintResult.summary.total,
          violations: lintResult.summary.violations,
          errors: errors.length,
          warnings: warnings.length,
          infos: infos.length,
          autoFixable: fixable.length,
        },
        violations: violations.map((v) => ({
          rule: v.rule,
          severity: v.severity,
          node: v.nodeName,
          issue: v.currentValue,
          suggestion: v.suggestion,
          autoFixable: v.autoFixable,
        })),
        structuralNotes,
        recommendation:
          errors.length > 0
            ? "Critical issues found. Run lint_fix_all to auto-fix what's possible, then address remaining errors manually."
            : warnings.length > 0
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
