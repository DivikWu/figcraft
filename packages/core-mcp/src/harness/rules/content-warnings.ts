/**
 * Harness Rule: content-warnings (Layer 2 — Post-Enrich)
 *
 * Detects placeholder text in create_frame params and injects warnings.
 * Migrated from bridge.ts L383-393 hardcoded post-processing.
 * Delegates to existing logic in tools/logic/content-warnings.ts.
 */

import { detectContentWarnings } from '../../tools/logic/content-warnings.js';
import type { HarnessAction, HarnessRule } from '../types.js';
import { PASS } from '../types.js';

export const contentWarningsRule: HarnessRule = {
  name: 'content-warnings',
  tools: ['create_frame'],
  phase: 'post-enrich',
  priority: 60,

  async execute(ctx): Promise<HarnessAction> {
    if (ctx.meta.isDryRun) return PASS;

    const warnings = detectContentWarnings(ctx.params);
    if (warnings.length === 0) return PASS;

    return {
      type: 'warn',
      warnings: warnings.map((w) => w.message),
    };
  },
};
