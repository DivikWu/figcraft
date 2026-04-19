/**
 * Unit tests for the `audit_node` MCP tool.
 *
 * Guards against the two bugs the design-review audit flagged:
 *   - severity buckets must match quality-engine LintSeverity vocabulary
 *     ('error' | 'unsafe' | 'heuristic' | 'style' | 'verbose')
 *   - the lint_check bridge call must NOT carry a stray undefined `tokenContext`
 *     (Plugin handler resolves token context from clientStorage)
 */
import { describe, expect, it, vi } from 'vitest';
import { registerAuditTools } from '../../packages/core-mcp/src/tools/audit.js';

// Minimal McpServer stub that captures the tool callback so we can invoke it directly.
function createCapturingServer() {
  const tools = new Map<string, (args: unknown) => Promise<unknown>>();
  const server = {
    tool(name: string, _description: string, _schema: unknown, handler: (args: unknown) => Promise<unknown>) {
      tools.set(name, handler);
    },
  };
  return { server: server as unknown as Parameters<typeof registerAuditTools>[0], tools };
}

function createBridge(handlers: Record<string, (params: unknown) => unknown>) {
  return {
    isConnected: true,
    request: vi.fn(async (method: string, params: unknown) => {
      const h = handlers[method];
      if (!h) throw new Error(`No mock handler for bridge method: ${method}`);
      return h(params);
    }),
  } as unknown as Parameters<typeof registerAuditTools>[1];
}

interface AuditReport {
  qualityScore: number;
  summary:
    | {
        totalChecked: number;
        violations: number;
        errors: number;
        unsafes: number;
        heuristics: number;
        styles: number;
        autoFixable: number;
      }
    | { lintUnavailable: true; error?: string };
  violations: Array<{ rule: string; severity: string }>;
  recommendation: string;
}

async function invokeAuditNode(
  bridgeHandlers: Record<string, (params: unknown) => unknown>,
  args: { nodeId: string; categories?: string[] } = { nodeId: '1:1' },
): Promise<AuditReport> {
  const { server, tools } = createCapturingServer();
  const bridge = createBridge(bridgeHandlers);
  registerAuditTools(server, bridge);
  const handler = tools.get('audit_node');
  if (!handler) throw new Error('audit_node not registered');
  const res = (await handler(args)) as { content: Array<{ type: 'text'; text: string }> };
  return JSON.parse(res.content[0].text) as AuditReport;
}

const NODE_INFO_HANDLER = (_params: unknown) => ({
  id: '1:1',
  name: 'Frame',
  type: 'FRAME',
  width: 100,
  height: 100,
  layoutMode: 'VERTICAL',
  children: [],
});

const EMPTY_BINDINGS = (_params: unknown) => ({ bindings: {} });
const EMPTY_TEXT = (_params: unknown) => ({ texts: [] });

function buildLintResult(violations: Array<{ severity: string; rule?: string; autoFixable?: boolean }>) {
  return {
    summary: { total: 1, violations: violations.length, bySeverity: {} },
    categories: [
      {
        rule: 'group',
        description: 'group',
        count: violations.length,
        nodes: violations.map((v, i) => ({
          nodeId: '1:1',
          nodeName: 'n',
          rule: v.rule ?? `rule-${i}`,
          severity: v.severity,
          currentValue: null,
          suggestion: 'fix it',
          autoFixable: v.autoFixable ?? false,
        })),
      },
    ],
  };
}

describe('audit_node — severity bucketing (P0-1)', () => {
  it('counts every quality-engine LintSeverity value into the right bucket', async () => {
    const report = await invokeAuditNode({
      get_node_info: NODE_INFO_HANDLER,
      get_node_variables: EMPTY_BINDINGS,
      text_scan: EMPTY_TEXT,
      lint_check: () =>
        buildLintResult([
          { severity: 'error' },
          { severity: 'unsafe' },
          { severity: 'heuristic' },
          { severity: 'heuristic' },
          { severity: 'style' },
          { severity: 'verbose' },
        ]),
    });

    if ('lintUnavailable' in report.summary) throw new Error('expected lint summary');
    expect(report.summary.errors).toBe(1);
    expect(report.summary.unsafes).toBe(1);
    expect(report.summary.heuristics).toBe(2);
    expect(report.summary.styles).toBe(2); // style + verbose
  });

  it('does not silently drop heuristic violations from the score', async () => {
    // Pre-fix bug: only `error` was counted, so 50 heuristic violations → score 100.
    const violations = Array.from({ length: 10 }, () => ({ severity: 'heuristic' as const }));
    const report = await invokeAuditNode({
      get_node_info: NODE_INFO_HANDLER,
      get_node_variables: EMPTY_BINDINGS,
      text_scan: EMPTY_TEXT,
      lint_check: () => buildLintResult(violations),
    });

    expect(report.qualityScore).toBeLessThan(100);
    expect(report.qualityScore).toBe(100 - 10 * 3); // heuristic weight = 3
  });

  it('weights errors more heavily than styles', async () => {
    const errReport = await invokeAuditNode({
      get_node_info: NODE_INFO_HANDLER,
      get_node_variables: EMPTY_BINDINGS,
      text_scan: EMPTY_TEXT,
      lint_check: () => buildLintResult([{ severity: 'error' }]),
    });
    const styleReport = await invokeAuditNode({
      get_node_info: NODE_INFO_HANDLER,
      get_node_variables: EMPTY_BINDINGS,
      text_scan: EMPTY_TEXT,
      lint_check: () => buildLintResult([{ severity: 'style' }]),
    });

    expect(errReport.qualityScore).toBeLessThan(styleReport.qualityScore);
  });

  it('recommends fixing when only heuristic/unsafe violations exist (not just errors)', async () => {
    const report = await invokeAuditNode({
      get_node_info: NODE_INFO_HANDLER,
      get_node_variables: EMPTY_BINDINGS,
      text_scan: EMPTY_TEXT,
      lint_check: () => buildLintResult([{ severity: 'heuristic' }]),
    });

    expect(report.recommendation).toMatch(/lint_fix_all/i);
    expect(report.recommendation).not.toMatch(/passes quality checks/i);
  });
});

describe('audit_node — lint_check call shape (P0-2)', () => {
  it('does not include a stray tokenContext key in the lint_check params', async () => {
    const lintCheck = vi.fn(() => buildLintResult([]));
    const bridge = createBridge({
      get_node_info: NODE_INFO_HANDLER,
      get_node_variables: EMPTY_BINDINGS,
      text_scan: EMPTY_TEXT,
      lint_check: lintCheck,
    });
    const { server, tools } = createCapturingServer();
    registerAuditTools(server, bridge);
    const handler = tools.get('audit_node')!;
    await handler({ nodeId: '1:1' });

    const lintCall = (bridge.request as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[0] === 'lint_check');
    expect(lintCall).toBeDefined();
    const params = lintCall![1] as Record<string, unknown>;
    expect(params).not.toHaveProperty('tokenContext');
    expect(params.nodeIds).toEqual(['1:1']);
    expect(params.maxViolations).toBe(100);
  });

  it('passes through the categories filter when provided', async () => {
    const lintCheck = vi.fn(() => buildLintResult([]));
    const bridge = createBridge({
      get_node_info: NODE_INFO_HANDLER,
      get_node_variables: EMPTY_BINDINGS,
      text_scan: EMPTY_TEXT,
      lint_check: lintCheck,
    });
    const { server, tools } = createCapturingServer();
    registerAuditTools(server, bridge);
    await tools.get('audit_node')!({ nodeId: '1:1', categories: ['wcag', 'token'] });

    const lintCall = (bridge.request as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[0] === 'lint_check')!;
    expect((lintCall[1] as { categories: string[] }).categories).toEqual(['wcag', 'token']);
  });
});

describe('audit_node — graceful degradation', () => {
  it('reports lintUnavailable when lint_check throws', async () => {
    const report = await invokeAuditNode({
      get_node_info: NODE_INFO_HANDLER,
      get_node_variables: EMPTY_BINDINGS,
      text_scan: EMPTY_TEXT,
      lint_check: () => {
        throw new Error('plugin offline');
      },
    });

    if (!('lintUnavailable' in report.summary)) throw new Error('expected lintUnavailable');
    expect(report.summary.lintUnavailable).toBe(true);
    expect(report.summary.error).toContain('plugin offline');
    expect(report.qualityScore).toBe(-1);
  });
});
