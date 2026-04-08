/**
 * Harness Rule: design-preflight (Layer 0 — Pre-Guard)
 *
 * Enforces that get_mode must be called before UI creation tools.
 * Migrated from bridge.ts L311-323 hardcoded guard.
 */

import type { HarnessAction, HarnessRule } from '../types.js';

export const designPreflightRule: HarnessRule = {
  name: 'design-preflight',
  tools: ['create_frame', 'create_text', 'create_svg'],
  phase: 'pre-guard',
  priority: 10, // run early — fundamental gate

  async execute(ctx): Promise<HarnessAction> {
    if (!ctx.session.modeQueried) {
      return {
        type: 'block',
        message:
          `Cannot call ${ctx.toolName} before get_mode. ` +
          'Design preflight required: call get_mode first to check library status and get workflow instructions, ' +
          'then present a design proposal to the user and wait for confirmation before creating UI elements.',
      };
    }
    return { type: 'pass' };
  },
};
