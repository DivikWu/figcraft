/**
 * Unit tests for the `compliance_report` MCP tool.
 *
 * Guards against the categorization bug: previously a string-prefix heuristic
 * misclassified rules whose names didn't fit the recognized prefixes (e.g.
 * `placeholder-text` is naming, but fell through to `layout`; `empty-container`
 * is layout but the heuristic worked by accident).
 *
 * The fix routes through `getAvailableRules()` from quality-engine — the
 * authoritative source of each rule's category.
 */
import { getAvailableRules } from '@figcraft/quality-engine';
import { describe, expect, it, vi } from 'vitest';
import { registerLintTools } from '../../packages/core-mcp/src/tools/lint.js';

function createCapturingServer() {
  const tools = new Map<string, (args: unknown) => Promise<unknown>>();
  const server = {
    tool(name: string, _description: string, _schema: unknown, handler: (args: unknown) => Promise<unknown>) {
      tools.set(name, handler);
    },
  };
  return { server: server as unknown as Parameters<typeof registerLintTools>[0], tools };
}

function createBridge(handlers: Record<string, (params: unknown) => unknown>) {
  return {
    isConnected: true,
    request: vi.fn(async (method: string, params: unknown) => {
      const h = handlers[method];
      if (!h) throw new Error(`No mock handler for bridge method: ${method}`);
      return h(params);
    }),
  } as unknown as Parameters<typeof registerLintTools>[1];
}

function buildLintReportWithRules(ruleNames: string[]) {
  return {
    summary: { total: ruleNames.length, pass: 0, violations: ruleNames.length, bySeverity: {} },
    categories: ruleNames.map((rule) => ({
      rule,
      description: rule,
      count: 1,
      nodes: [{ severity: 'heuristic' }],
    })),
  };
}

const EMPTY_AUDIT_HANDLER = (_p: unknown) => ({
  summary: { totalComponents: 0, totalIssues: 0 },
  issues: [],
});

interface ComplianceReport {
  overallScore: number;
  lint: {
    score: number;
    byCategory: Record<string, { count: number; rules: string[] }>;
  };
  components: { score: number };
}

async function invokeComplianceReport(
  bridgeHandlers: Record<string, (params: unknown) => unknown>,
): Promise<ComplianceReport> {
  const { server, tools } = createCapturingServer();
  const bridge = createBridge(bridgeHandlers);
  registerLintTools(server, bridge);
  const handler = tools.get('compliance_report')!;
  const res = (await handler({})) as { content: Array<{ type: 'text'; text: string }> };
  return JSON.parse(res.content[0].text) as ComplianceReport;
}

describe('compliance_report — category mapping', () => {
  it('routes naming rules into the naming bucket (was misclassified pre-fix)', async () => {
    // `placeholder-text` is category=naming but pre-fix heuristic matched neither
    // the explicit `default-name`/`stale-text-name` allowlist nor any prefix,
    // so it fell through to `layout`.
    const report = await invokeComplianceReport({
      lint_check: () => buildLintReportWithRules(['placeholder-text']),
      audit_components: EMPTY_AUDIT_HANDLER,
    });

    expect(report.lint.byCategory.naming).toBeDefined();
    expect(report.lint.byCategory.naming.count).toBe(1);
    expect(report.lint.byCategory.layout).toBeUndefined();
  });

  it('routes wcag-* rules into wcag', async () => {
    const report = await invokeComplianceReport({
      lint_check: () => buildLintReportWithRules(['wcag-contrast', 'wcag-target-size', 'wcag-text-size']),
      audit_components: EMPTY_AUDIT_HANDLER,
    });

    expect(report.lint.byCategory.wcag.count).toBe(3);
  });

  it('routes spec-* and hardcoded-token into token', async () => {
    const report = await invokeComplianceReport({
      lint_check: () => buildLintReportWithRules(['spec-color', 'hardcoded-token', 'no-text-style']),
      audit_components: EMPTY_AUDIT_HANDLER,
    });

    expect(report.lint.byCategory.token.count).toBe(3);
  });

  it('routes layout rules into layout', async () => {
    const report = await invokeComplianceReport({
      lint_check: () => buildLintReportWithRules(['empty-container', 'max-nesting-depth', 'no-autolayout']),
      audit_components: EMPTY_AUDIT_HANDLER,
    });

    expect(report.lint.byCategory.layout.count).toBe(3);
  });

  it('every shipped rule resolves to a non-fallback category', () => {
    // Defensive: prove the lookup is complete so unknown→layout fallback only
    // ever fires for genuinely-new rules, not for currently-shipped ones.
    const allRules = getAvailableRules();
    const knownCategories = new Set(['token', 'layout', 'naming', 'wcag', 'component']);
    for (const r of allRules) {
      expect(knownCategories.has(r.category)).toBe(true);
    }
  });
});

describe('compliance_report — score formulas', () => {
  it('lintScore is 100 when no nodes were checked', async () => {
    const report = await invokeComplianceReport({
      lint_check: () => ({ summary: { total: 0, pass: 0, violations: 0, bySeverity: {} }, categories: [] }),
      audit_components: EMPTY_AUDIT_HANDLER,
    });
    expect(report.lint.score).toBe(100);
    expect(report.components.score).toBe(100);
  });

  it('componentScore floors at 0 for high issue density', async () => {
    const report = await invokeComplianceReport({
      lint_check: () => buildLintReportWithRules([]),
      // 10 components, 100 issues → ratio 10 → score 100 - 250 → floored to 0
      audit_components: () => ({
        summary: { totalComponents: 10, totalIssues: 100 },
        issues: [],
      }),
    });
    expect(report.components.score).toBe(0);
  });
});
