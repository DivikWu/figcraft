/**
 * Harness Rule: design-decisions (Layer 2 — Post-Enrich + Layer 5 — Session Update)
 *
 * Extracts color/font/radius/spacing choices from create_frame params
 * and merges into session for cross-screen consistency.
 *
 * Migrated from bridge.ts L369-380 hardcoded post-processing.
 * Delegates to existing logic in tools/logic/design-decisions.ts.
 */

import type { Bridge } from '../../bridge.js';
import { extractDesignDecisions } from '../../tools/logic/design-decisions.js';
import type { HarnessAction, HarnessRule } from '../types.js';
import { PASS } from '../types.js';

/**
 * Factory: create the design-decisions rule with a bridge reference.
 * Needs bridge because extractDesignDecisions() calls bridge.mergeDesignDecisions().
 */
export function createDesignDecisionsRule(bridge: Bridge): HarnessRule {
  return {
    name: 'design-decisions',
    tools: ['create_frame'],
    phase: 'session-update',
    priority: 50,

    async execute(ctx): Promise<HarnessAction> {
      if (ctx.meta.isDryRun) return PASS;
      if (!ctx.result) return PASS;

      if (!ctx.session.selectedLibrary) {
        // Creator mode: track all explicit choices
        extractDesignDecisions(bridge, ctx.params);
      } else {
        // Library mode: track hardcoded hex/font fallbacks for consistency
        extractDesignDecisions(bridge, ctx.params, 'libraryFallback');
      }

      return PASS;
    },
  };
}
