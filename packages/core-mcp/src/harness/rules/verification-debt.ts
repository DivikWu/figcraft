/**
 * Harness Rules: Verification Debt (Layer 2 + Layer 5)
 *
 * Tracks root-level creations that haven't been verified.
 * Injects persistent _verificationDebt reminders into all tool responses.
 *
 * Three rules:
 * 1. record-creation-debt (session-update) — records creations into debt tracker
 * 2. record-verification (session-update) — clears debt on verify_design/lint_fix_all
 * 3. verification-debt-remind (post-enrich) — injects _verificationDebt into responses
 *
 * Debt counting rules:
 * - Single create_frame (root-level or has role): +1
 * - items[] batch: +count of successful items
 * - dryRun / child frame (parentId + no role): skip
 * - verify_design(nodeId): clears specific node
 * - verify_design() / lint_fix_all: clears all
 */

import type { HarnessAction, HarnessRule } from '../types.js';
import { PASS } from '../types.js';

/** Methods that are exempt from debt reminders (prevent recursive noise). */
const EXEMPT_FROM_REMINDERS = new Set(['lint_check', 'lint_fix', 'export_image']);

// ─── Rule 1: Record creation debt ───

export const recordCreationDebtRule: HarnessRule = {
  name: 'record-creation-debt',
  tools: ['create_frame'],
  phase: 'session-update',
  priority: 40,

  async execute(ctx): Promise<HarnessAction> {
    if (ctx.meta.isDryRun) return PASS;
    // Only track root-level creations or nodes with explicit role
    if (!ctx.meta.isRootLevel && !ctx.params.role) return PASS;
    if (!ctx.result || typeof ctx.result !== 'object') return PASS;

    const r = ctx.result as Record<string, unknown>;

    // items[] batch mode: count successful creations
    if (Array.isArray(r.items)) {
      const created = (r.items as Array<{ id?: string; name?: string; ok?: boolean }>)
        .filter((item) => item.ok && item.id)
        .map((item) => ({ nodeId: item.id!, name: (item.name as string) || 'Frame' }));
      if (created.length > 0) {
        ctx.session.recordCreations(created);
      }
      return PASS;
    }

    // Single node mode
    if (typeof r.id === 'string') {
      ctx.session.recordCreation(r.id, (r.name as string) || 'Frame');
    }

    return PASS;
  },
};

// ─── Rule 2: Record verification (clears debt) ───

export const recordVerificationRule: HarnessRule = {
  name: 'record-verification',
  tools: ['verify_design', 'lint_fix_all'],
  phase: 'session-update',
  priority: 40,

  async execute(ctx): Promise<HarnessAction> {
    if (ctx.error) return PASS; // don't clear debt on failed verification

    if (ctx.toolName === 'verify_design' && typeof ctx.params.nodeId === 'string') {
      ctx.session.recordVerification(ctx.params.nodeId);
    } else {
      ctx.session.recordVerification(); // page-level — clear all
    }

    return PASS;
  },
};

// ─── Rule 3: Inject verification debt reminder ───

export const verificationDebtRemindRule: HarnessRule = {
  name: 'verification-debt-remind',
  tools: ['*'],
  phase: 'post-enrich',
  priority: 190, // run late, before response-size-guard (200)

  async execute(ctx): Promise<HarnessAction> {
    if (ctx.session.verificationDebt === 0) return PASS;
    if (EXEMPT_FROM_REMINDERS.has(ctx.bridgeMethod)) return PASS;

    const nodes = ctx.session.unverifiedNodes.slice(0, 5);
    return {
      type: 'enrich',
      fields: {
        _verificationDebt: {
          unverifiedCount: ctx.session.verificationDebt,
          nodes,
          action:
            `⚠️ ${ctx.session.verificationDebt} screen(s) created but NOT verified. ` +
            `Call verify_design() before replying to user.`,
        },
      },
    };
  },
};
