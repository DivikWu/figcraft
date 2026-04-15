/**
 * Harness Rule: auto-save (Layer 0 — Pre-Guard, non-blocking)
 *
 * Automatically saves a named version history snapshot before destructive
 * operations. This ensures designers can always recover from accidental
 * AI-driven deletions or modifications.
 *
 * Covered destructive operations:
 * - nodes(method: "delete")
 * - variables_ep(method: "delete" | "delete_collection")
 * - styles_ep(method: "delete")
 *
 * Debounce: only saves once per DEBOUNCE_MS window to avoid spamming
 * version history during rapid sequential operations.
 *
 * Recursion safety: this rule matches specific tool names (nodes,
 * variables_ep, styles_ep). The save_version_history call goes through
 * the pipeline but won't re-trigger this rule.
 *
 * Cross-IDE: runs in the MCP Server harness layer, so it works in any
 * IDE (Cursor, Kiro, Claude Code, etc.) without IDE-specific hooks.
 */

import type { Bridge } from '../../bridge.js';
import type { HarnessAction, HarnessRule } from '../types.js';
import { PASS } from '../types.js';

const DEBOUNCE_MS = 30_000; // 30s — at most one auto-save per 30 seconds
const SAVE_TIMEOUT_MS = 5_000; // 5s timeout for save_version_history call

/** Tool → destructive method names mapping. */
const DESTRUCTIVE_METHODS: Record<string, Set<string>> = {
  nodes: new Set(['delete']),
  variables_ep: new Set(['delete', 'delete_collection']),
  styles_ep: new Set(['delete']),
};

/**
 * Bridge method names that are destructive.
 * Endpoint tools dispatch through bridgeRequestLogic which uses the bridge
 * method name (e.g. 'delete_nodes') as the toolName in the harness pipeline,
 * not the endpoint name ('nodes'). We match both patterns.
 */
const DESTRUCTIVE_BRIDGE_METHODS = new Set(['delete_nodes', 'delete_variable', 'delete_collection', 'delete_style']);

/**
 * Check if a tool call is destructive based on toolName and params.
 */
function isDestructive(toolName: string, params: Record<string, unknown>): boolean {
  // Match bridge method names (endpoint dispatch path)
  if (DESTRUCTIVE_BRIDGE_METHODS.has(toolName)) return true;
  // Match endpoint names with method param (direct call path)
  const methods = DESTRUCTIVE_METHODS[toolName];
  if (!methods) return false;
  const method = params.method as string | undefined;
  return !!method && methods.has(method);
}

/**
 * Build a human-readable title for the auto-save snapshot.
 */
function buildTitle(toolName: string, params: Record<string, unknown>): string {
  // Bridge method names (e.g. 'delete_nodes')
  if (DESTRUCTIVE_BRIDGE_METHODS.has(toolName)) {
    const nodeId = params.nodeId as string | undefined;
    const nodeIds = params.nodeIds as string[] | undefined;
    const target = nodeId ?? (nodeIds ? `${nodeIds.length} nodes` : '');
    return target ? `Auto-save before ${toolName} (${target})` : `Auto-save before ${toolName}`;
  }
  // Endpoint names with method param
  const method = params.method as string;
  if (toolName === 'nodes') {
    const nodeId = params.nodeId as string | undefined;
    const nodeIds = params.nodeIds as string[] | undefined;
    const target = nodeId ?? (nodeIds ? `${nodeIds.length} nodes` : 'unknown');
    return `Auto-save before ${method} (${target})`;
  }
  return `Auto-save before ${toolName}.${method}`;
}

/**
 * Factory: create the auto-save rule with a bridge reference.
 * Needs bridge to call save_version_history via bridge.request().
 */
export function createAutoSaveRule(bridge: Bridge): HarnessRule {
  let lastSaveTime = 0;

  return {
    name: 'auto-save',
    tools: [
      'nodes',
      'variables_ep',
      'styles_ep',
      'delete_nodes',
      'delete_variable',
      'delete_collection',
      'delete_style',
    ],
    phase: 'pre-guard',
    priority: 5, // very early — before other pre-guards

    async execute(ctx): Promise<HarnessAction> {
      if (!isDestructive(ctx.toolName, ctx.params)) return PASS;

      // Debounce: skip if we saved recently
      const now = Date.now();
      if (now - lastSaveTime < DEBOUNCE_MS) return PASS;

      // Best-effort save — failure must not block the actual operation
      try {
        const title = buildTitle(ctx.toolName, ctx.params);
        await bridge.request(
          'save_version_history',
          { title, description: 'Automatic snapshot before destructive operation' },
          SAVE_TIMEOUT_MS,
        );
        lastSaveTime = Date.now();
      } catch {
        // Save failed (timeout, plugin disconnected, etc.) — proceed anyway
      }

      return PASS;
    },
  };
}
