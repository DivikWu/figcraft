/**
 * Harness Rule: next-steps (Layer 2 — Post-Enrich)
 *
 * Injects _nextSteps guidance into tool responses to help AI
 * follow multi-step workflows correctly.
 *
 * Data sourced from content/harness/next-steps.yaml (compiled to _harness.ts).
 */

import { NEXT_STEPS } from '../_harness.js';
import type { HarnessAction, HarnessRule } from '../types.js';
import { PASS } from '../types.js';

const NEXT_STEPS_MAP = new Map(NEXT_STEPS.map((d) => [d.tool, d.steps]));

export const nextStepsRule: HarnessRule = {
  name: 'next-steps',
  tools: NEXT_STEPS.map((d) => d.tool),
  phase: 'post-enrich',
  priority: 80,

  async execute(ctx): Promise<HarnessAction> {
    if (ctx.error) return PASS;

    const steps = NEXT_STEPS_MAP.get(ctx.toolName);
    if (!steps) return PASS;

    return {
      type: 'enrich',
      fields: { _nextSteps: steps },
    };
  },
};
