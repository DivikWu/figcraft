/**
 * Harness Rule: response-size-guard (Layer 2 — Post-Enrich)
 *
 * Automatically truncates responses exceeding 50KB.
 * Migrated from Bridge.guardResponseSize() static method (bridge.ts L748-793).
 * Previously required manual calls — now runs automatically for all tools.
 */

import { truncateStructurally } from '../../tools/response-helpers.js';
import type { HarnessAction, HarnessRule } from '../types.js';
import { PASS } from '../types.js';

const MAX_RESPONSE_CHARS = 50_000;

export const responseSizeGuardRule: HarnessRule = {
  name: 'response-size-guard',
  tools: ['*'],
  phase: 'post-enrich',
  priority: 210, // run absolute last — after debt reminders (190) to avoid pushing response over limit

  async execute(ctx): Promise<HarnessAction> {
    if (!ctx.result) return PASS;

    const json = JSON.stringify(ctx.result);
    if (json.length <= MAX_RESPONSE_CHARS) return PASS;

    // Attempt structural truncation (valid JSON)
    const truncated = truncateStructurally(ctx.result, MAX_RESPONSE_CHARS);
    const truncatedJson = JSON.stringify(truncated);
    if (truncatedJson.length <= MAX_RESPONSE_CHARS) {
      if (truncated && typeof truncated === 'object' && !Array.isArray(truncated)) {
        (truncated as Record<string, unknown>)._truncatedFromKB = Math.round(json.length / 1024);
      }
      // Replace result in context
      ctx.result = truncated;
      return PASS;
    }

    // Structural truncation still too large — replace with error
    const sizeKB = Math.round(json.length / 1024);
    const limitKB = Math.round(MAX_RESPONSE_CHARS / 1024);
    ctx.result = {
      _error: 'response_too_large',
      _sizeKB: sizeKB,
      _limitKB: limitKB,
      method: ctx.bridgeMethod,
      warning: `Response is ${sizeKB}KB, exceeding the ${limitKB}KB limit. The data was truncated to prevent context overflow.`,
      hints: [
        'Use maxDepth=1 or maxDepth=2 to limit tree depth',
        'Use detail="summary" for tree browsing, detail="standard" for inspection',
        'Use nodes(method: "get") on specific nodes instead of fetching the full tree',
        'Use nodes(method: "list") with a query to find specific nodes',
      ],
    };
    return PASS;
  },
};
