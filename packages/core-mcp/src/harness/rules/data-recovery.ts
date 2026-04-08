/**
 * Data-driven error recovery rules — generated from content/harness/recovery-patterns.yaml.
 *
 * Instead of 6 separate TypeScript files with hardcoded patterns,
 * this single file reads compiled YAML data and generates HarnessRules dynamically.
 * UX designers can edit the YAML and run `npm run content` to update.
 */

import { RECOVERY_PATTERNS } from '../_harness.js';
import type { HarnessAction, HarnessRule } from '../types.js';
import { PASS } from '../types.js';

/** Connection-lost gets higher priority (most common error). */
const HIGH_PRIORITY_RULES = new Set(['connection-lost']);

/** Generate recovery rules from compiled YAML patterns. */
export function createRecoveryRules(): HarnessRule[] {
  return RECOVERY_PATTERNS.map(
    (pattern): HarnessRule => ({
      name: `recovery-${pattern.name}`,
      tools: pattern.tools,
      phase: 'error-recovery',
      priority: HIGH_PRIORITY_RULES.has(pattern.name) ? 10 : 50,

      async execute(ctx): Promise<HarnessAction> {
        if (!ctx.error) return PASS;
        const msg = ctx.error.message;
        if (!pattern.patterns.some((p) => p.test(msg))) return PASS;

        // Include recent errors of the same type for cross-turn context
        const recentErrors = ctx.session.getRecentErrors(ctx.toolName);

        return {
          type: 'recover',
          recovery: {
            errorType: pattern.errorType,
            suggestion: pattern.suggestion,
            ...(pattern.retryHint ? { retryHint: pattern.retryHint } : {}),
            ...(pattern.doNotRetry ? { doNotRetry: true } : {}),
            ...(recentErrors.length > 0 ? { _recentErrors: recentErrors } : {}),
          },
        };
      },
    }),
  );
}
