/**
 * Write-node logic functions — extracted from write-nodes.ts server.tool() callbacks.
 * Shared by both flat tools and endpoint tools.
 */

import type { Bridge } from '../../bridge.js';
import type { McpResponse } from './node-logic.js';

const VALID_TYPES = new Set(['frame', 'text', 'rectangle', 'ellipse', 'line', 'vector', 'instance']);

function validateTypes(specs: Array<Record<string, unknown>>, path: string): string | null {
  for (let i = 0; i < specs.length; i++) {
    const t = specs[i].type;
    if (!t || !VALID_TYPES.has(t as string)) {
      return `${path}[${i}].type is ${t === undefined ? 'missing' : `"${t}" (invalid)`}. Must be one of: ${[...VALID_TYPES].join(', ')}`;
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

export async function createDocumentLogic(
  bridge: Bridge,
  params: { parentId?: string; nodes: Array<Record<string, unknown>> },
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

  const result = await bridge.request('create_document', { parentId: params.parentId, nodes: params.nodes }, 120_000) as {
    ok: boolean;
    created: Array<{ id: string; name: string; type: string }>;
    truncated?: boolean;
    warnings?: string[];
    errors?: Array<{ index: number; name?: string; type: string; error: string }>;
  };

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
  const lintHint = createdIds.length > 0
    ? `\n⚡ NEXT: Run lint_fix_all with nodeIds: ${JSON.stringify(createdIds)} to verify only the newly created nodes (faster than full-page lint).`
    : '';

  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) + lintHint }] };
}
