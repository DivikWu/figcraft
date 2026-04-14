/**
 * Harness Rule: resolve-icons (Layer 1 — Pre-Transform + Layer 2 — Post-Enrich)
 *
 * Resolves {type: "icon"} children to SVG before sending to Plugin.
 * Migrated from create-frame.ts custom handler (resolveIconChildren call).
 *
 * Uses ctx.ruleState to pass warnings between pre-transform and post-enrich
 * phases (no mutation of ctx.params for rule internal state).
 */

import { type IconWarning, resolveIconChildren } from '../../tools/logic/resolve-icons.js';
import type { HarnessAction, HarnessRule } from '../types.js';
import { PASS } from '../types.js';

const ICON_WARNINGS_KEY = 'iconWarnings';

export const resolveIconsPreTransform: HarnessRule = {
  name: 'resolve-icons',
  // create_component delegates to create_frame internally but goes through its own
  // MCP dispatch path — harness rules must be registered per-tool. Without
  // create_component here, inline {type:"icon"} children in create_component calls
  // reach the Plugin unresolved and fall into the default `frame` branch → empty frames.
  // See .claude/plans/joyful-stirring-lobster.md (缺陷 2 in the Kiro self-diagnosis).
  tools: ['create_frame', 'create_component'],
  phase: 'pre-transform',
  priority: 50,

  async execute(ctx): Promise<HarnessAction> {
    const warnings = await resolveIconChildren(ctx.params);
    if (warnings.length > 0) {
      ctx.ruleState[ICON_WARNINGS_KEY] = warnings;
    }
    // params are mutated in-place by resolveIconChildren
    return { type: 'transform', params: ctx.params };
  },
};

export const resolveIconsPostEnrich: HarnessRule = {
  name: 'resolve-icons-warnings',
  tools: ['create_frame', 'create_component'],
  phase: 'post-enrich',
  priority: 55,

  async execute(ctx): Promise<HarnessAction> {
    const warnings = ctx.ruleState[ICON_WARNINGS_KEY] as IconWarning[] | undefined;
    if (!warnings || warnings.length === 0) return PASS;

    return {
      type: 'warn',
      warnings: warnings.map((w) => `Icon "${w.icon}" failed: ${w.error}`),
    };
  },
};
