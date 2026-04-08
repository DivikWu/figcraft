/**
 * Harness Rule: error-journal (Layer 5 — Session Update)
 *
 * Records errors into the session's error journal for cross-turn learning.
 * The journal is injected into _workflow._recentErrors by mode-logic.ts
 * so AI sees past mistakes at the start of each design cycle.
 */

import type { HarnessAction, HarnessRule } from '../types.js';
import { PASS } from '../types.js';

/** Extract a short error type from an error message. */
function classifyError(message: string): string {
  if (/not connected|timed out/i.test(message)) return 'connection_lost';
  if (/not found|does not exist/i.test(message)) return 'not_found';
  if (/ENOENT|no such file/i.test(message)) return 'file_not_found';
  if (/json.*parse|syntax.*error/i.test(message)) return 'parse_error';
  if (/too large|exceed/i.test(message)) return 'response_too_large';
  if (/permission|access/i.test(message)) return 'permission_denied';
  return 'unknown';
}

export const errorJournalRule: HarnessRule = {
  name: 'error-journal',
  tools: ['*'],
  phase: 'session-update',
  priority: 200, // run last

  async execute(ctx): Promise<HarnessAction> {
    if (!ctx.error) return PASS;

    const errorType = classifyError(ctx.error.message);
    const detail = ctx.error.message.length > 120 ? ctx.error.message.slice(0, 120) + '…' : ctx.error.message;

    ctx.session.recordError(ctx.toolName, errorType, detail);
    return PASS;
  },
};
