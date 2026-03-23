/**
 * Write-node logic functions — extracted from write-nodes.ts server.tool() callbacks.
 * Shared by both flat tools and endpoint tools.
 */

import type { Bridge } from '../../bridge.js';
import type { McpResponse } from './node-logic.js';
import { normalizeNodeForest } from './node-spec-normalizer.js';

const VALID_TYPES = new Set(['frame', 'text', 'rectangle', 'ellipse', 'line', 'vector', 'instance']);
const VALID_ROLES = new Set([
  'screen', 'header', 'hero', 'nav', 'content', 'list', 'row', 'stats', 'card',
  'form', 'field', 'input', 'button', 'footer', 'actions', 'social_row', 'system_bar',
]);

function normalizeRole(role: string): string {
  return role.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function validateTypes(specs: Array<Record<string, unknown>>, path: string): string | null {
  for (let i = 0; i < specs.length; i++) {
    const t = specs[i].type;
    if (!t || !VALID_TYPES.has(t as string)) {
      return `${path}[${i}].type is ${t === undefined ? 'missing' : `"${t}" (invalid)`}. Must be one of: ${[...VALID_TYPES].join(', ')}`;
    }
    const role = specs[i].role;
    if (role != null) {
      if (typeof role !== 'string' || !VALID_ROLES.has(normalizeRole(role))) {
        return `${path}[${i}].role is ${typeof role === 'string' ? `"${role}" (invalid)` : `${String(role)} (invalid)`}. Must be one of: ${[...VALID_ROLES].join(', ')}`;
      }
    }
    if (Array.isArray(specs[i].children)) {
      const childErr = validateTypes(specs[i].children as Array<Record<string, unknown>>, `${path}[${i}].children`);
      if (childErr) return childErr;
    }
  }
  return null;
}

function countNodes(specs: Array<Record<string, unknown>>): number {
  let c = 0;
  for (const s of specs) {
    c++;
    if (Array.isArray(s.children)) c += countNodes(s.children as Array<Record<string, unknown>>);
  }
  return c;
}

export interface CreateDocumentExtra {
  _meta?: { progressToken?: unknown };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendNotification: (...args: any[]) => Promise<void>;
}

interface BridgeCreateResult {
  ok: boolean;
  created: Array<{ id: string; name: string; type: string }>;
  truncated?: boolean;
  warnings?: string[];
  errors?: Array<{ index: number; name?: string; type: string; error: string }>;
}

interface BridgeLintViolation {
  nodeId?: string;
  nodeName?: string;
  rule?: string;
  severity?: string;
  autoFixable?: boolean;
  fixData?: Record<string, unknown>;
  [key: string]: unknown;
}

interface BridgeLintReport {
  summary: { total: number; pass: number; violations: number; bySeverity?: Record<string, number> };
  categories: Array<{ rule: string; nodes: BridgeLintViolation[] }>;
}

interface BridgeLintFixResult {
  fixed: number;
  failed: number;
  errors: unknown[];
}

interface ScopedPostCreateLintOptions {
  includeRemainingViolations?: boolean;
}

function summarizeLintSummary(summary: BridgeLintReport['summary']): Record<string, unknown> {
  const bySeverity = summary.bySeverity ?? {};
  return {
    total: summary.total,
    pass: summary.pass,
    violations: summary.violations,
    bySeverity,
    criticalCount: typeof bySeverity.error === 'number' ? bySeverity.error : 0,
    errorCount: typeof bySeverity.error === 'number' ? bySeverity.error : 0,
    warningCount: typeof bySeverity.warning === 'number' ? bySeverity.warning : 0,
  };
}

export async function runScopedPostCreateLint(
  bridge: Bridge,
  nodeIds: string[],
  maxViolations = 200,
  options: ScopedPostCreateLintOptions = {},
): Promise<Record<string, unknown>> {
  const initialLint = await bridge.request('lint_check', {
    nodeIds,
    maxViolations,
    minSeverity: 'warning',
  }) as BridgeLintReport;

  const violations = initialLint.categories.flatMap((category) => category.nodes);
  const fixable = violations.filter((violation) => violation.autoFixable);
  let fixResult: BridgeLintFixResult = { fixed: 0, failed: 0, errors: [] };
  if (fixable.length > 0) {
    fixResult = await bridge.request('lint_fix', { violations: fixable }, 60_000) as BridgeLintFixResult;
  }

  const finalLint = await bridge.request('lint_check', {
    nodeIds,
    maxViolations,
    minSeverity: 'warning',
  }) as BridgeLintReport;

  const summary: Record<string, unknown> = {
    scopedNodeIds: nodeIds,
    initial: summarizeLintSummary(initialLint.summary),
    fixable: fixable.length,
    fixed: fixResult.fixed,
    fixFailed: fixResult.failed,
    remaining: finalLint.summary.violations,
    final: summarizeLintSummary(finalLint.summary),
  };
  if (options.includeRemainingViolations) {
    summary.remainingViolations = finalLint.categories.flatMap((category) => category.nodes);
  }
  return summary;
}

export async function createDocumentLogic(
  bridge: Bridge,
  params: {
    parentId?: string;
    nodes: Array<Record<string, unknown>>;
    autoLint?: boolean;
    includePostCreateLintViolations?: boolean;
  },
  extra?: CreateDocumentExtra,
): Promise<McpResponse> {
  // Runtime validation: ensure nodes is non-empty and every node (recursively) has a valid type
  if (!params.nodes || params.nodes.length === 0) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'nodes array must not be empty' }, null, 2) }],
      isError: true,
    };
  }

  const typeError = validateTypes(params.nodes, 'nodes');
  if (typeError) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: typeError }, null, 2) }],
      isError: true,
    };
  }

  // Count total nodes for progress estimation
  const totalNodes = countNodes(params.nodes);
  const normalizedNodes = normalizeNodeForest(params.nodes, { inferRole: false });

  // Start estimated progress reporting if client provided a progressToken
  const progressToken = extra?._meta?.progressToken;
  let progressTimer: ReturnType<typeof setInterval> | undefined;

  if (progressToken != null && extra?.sendNotification) {
    const estimatedMs = Math.min(22_000, Math.max(3_000, totalNodes * 400));
    const startTime = Date.now();
    let lastProgress = 0;
    progressTimer = setInterval(async () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(90, Math.floor((elapsed / estimatedMs) * 90));
      if (progress > lastProgress) {
        lastProgress = progress;
        try {
          await extra.sendNotification({
            method: 'notifications/progress' as const,
            params: { progressToken, progress, total: 100, message: `Creating ${totalNodes} nodes...` },
          });
        } catch { /* client may not support progress */ }
      }
    }, 500);
  }

  const result = await bridge.request('create_document', { parentId: params.parentId, nodes: normalizedNodes }, 120_000) as BridgeCreateResult;

  // Stop progress timer and send 100% completion
  if (progressTimer) clearInterval(progressTimer);
  if (progressToken != null && extra?.sendNotification) {
    try {
      await extra.sendNotification({
        method: 'notifications/progress' as const,
        params: { progressToken, progress: 100, total: 100, message: `Done — ${result.created?.length ?? 0} nodes created` },
      });
    } catch { /* ignore */ }
  }

  // Extract top-level created node IDs for scoped lint hint
  const createdIds = result.created?.map((n) => n.id) ?? [];
  const autoLint = params.autoLint !== false;
  let enrichedResult: Record<string, unknown> = { ...result };

  if (autoLint && createdIds.length > 0) {
    try {
      enrichedResult = {
        ...result,
        postCreateLint: await runScopedPostCreateLint(bridge, createdIds, 200, {
          includeRemainingViolations: params.includePostCreateLintViolations === true,
        }),
      };
    } catch (lintError) {
      enrichedResult = {
        ...result,
        postCreateLint: {
          scopedNodeIds: createdIds,
          error: lintError instanceof Error ? lintError.message : String(lintError),
        },
      };
    }
  } else if (createdIds.length > 0) {
    enrichedResult = {
      ...result,
      postCreateLint: {
        scopedNodeIds: createdIds,
        skipped: true,
      },
    };
  }

  const hasStructuralErrors = Array.isArray((enrichedResult as Record<string, unknown>).structuralErrors)
    && ((enrichedResult as Record<string, unknown>).structuralErrors as unknown[]).length > 0;
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(enrichedResult, null, 2) }],
    isError: enrichedResult.ok === false || hasStructuralErrors || undefined,
  };
}
