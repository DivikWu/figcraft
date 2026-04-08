/**
 * Harness Pipeline type definitions.
 *
 * The Harness Pipeline is a middleware system that runs before and after
 * bridge.request() to enforce guards, transform params, enrich responses,
 * recover from errors, and update session state.
 *
 * All rules implement the HarnessRule interface and declare which tools
 * they apply to and which pipeline phase they run in.
 */

import type { DesignSession } from '../design-session.js';

// ─── Pipeline phases (execution order) ───

export type HarnessPhase =
  | 'pre-guard' // Layer 0: block invalid calls
  | 'pre-transform' // Layer 1: enrich/correct params before bridge
  | 'post-enrich' // Layer 2: inject quality/warnings/hints into response
  | 'error-recovery' // Layer 4: on failure, classify + suggest fix
  | 'session-update'; // Layer 5: record outcome for cross-turn memory

// ─── Rule interface ───

/** A single harness rule. All rules implement this interface. */
export interface HarnessRule {
  /** Unique rule name (e.g. 'design-preflight', 'auto-verify'). */
  readonly name: string;
  /**
   * Tool name patterns this rule applies to.
   * - Exact match: `'create_frame'`
   * - Glob suffix: `'create_*'`
   * - All tools: `'*'`
   */
  readonly tools: readonly string[];
  /** Pipeline phase this rule runs in. */
  readonly phase: HarnessPhase;
  /** Priority — lower numbers run first. Default: 100. */
  readonly priority?: number;
  /** Execute the rule. Must return a HarnessAction. */
  execute(ctx: HarnessContext): Promise<HarnessAction>;
}

// ─── Context ───

/** Pipeline execution context — shared across all phases of a single request. */
export interface HarnessContext {
  /** MCP tool name (e.g. 'create_frame', 'nodes'). */
  readonly toolName: string;
  /** Bridge method name (may differ from toolName for endpoint tools). */
  readonly bridgeMethod: string;
  /** Request parameters (mutable — pre-transform can modify). */
  params: Record<string, unknown>;
  /** Design session state (verification debt, error journal, decisions). */
  readonly session: DesignSession;
  /** Response from bridge.request() — only available in post-enrich/session-update. */
  result?: unknown;
  /** Error from bridge.request() — only available in error-recovery. */
  error?: Error;
  /** Computed metadata about the request. */
  readonly meta: HarnessRequestMeta;
  /** Shared state for cross-phase rule communication. Rules can store/read data here. */
  ruleState: Record<string, unknown>;
}

export interface HarnessRequestMeta {
  /** Whether this tool modifies the Figma document. */
  readonly isWrite: boolean;
  /** Whether params.dryRun is true. */
  readonly isDryRun: boolean;
  /** Whether this is a root-level creation (no parentId). */
  readonly isRootLevel: boolean;
  /** Whether params.items is present (batch mode). */
  readonly isBatch: boolean;
}

// ─── Actions ───

/** The action a rule returns after execution. */
export type HarnessAction =
  | { readonly type: 'pass' }
  | { readonly type: 'block'; readonly message: string; readonly hint?: string }
  | { readonly type: 'transform'; readonly params: Record<string, unknown> }
  | { readonly type: 'enrich'; readonly fields: Record<string, unknown> }
  | { readonly type: 'warn'; readonly warnings: string[] }
  | { readonly type: 'recover'; readonly recovery: ErrorRecovery };

/** Structured error recovery suggestion injected into error responses. */
export interface ErrorRecovery {
  readonly errorType: string;
  readonly suggestion: string;
  readonly retryHint?: Record<string, unknown>;
  readonly doNotRetry?: boolean;
}

// ─── Convenience constants ───

export const PASS: HarnessAction = { type: 'pass' } as const;
