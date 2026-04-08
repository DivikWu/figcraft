/**
 * Harness Pipeline — initialization and rule registration.
 *
 * Creates a singleton pipeline instance and registers all harness rules.
 * Called from toolset-manager.ts during server initialization.
 *
 * Rules come from two sources:
 * - Code-type rules (TypeScript): complex logic that requires programming
 * - Data-type rules (YAML → compiled): recovery patterns + next-steps
 *   sourced from content/harness/*.yaml, editable by UX designers
 */

import type { Bridge } from '../bridge.js';
import { HarnessPipeline } from './pipeline.js';
import { createAutoVerifyRule } from './rules/auto-verify.js';
import { contentWarningsRule } from './rules/content-warnings.js';
import { createRecoveryRules } from './rules/data-recovery.js';
import { createDesignDecisionsRule } from './rules/design-decisions.js';
import { designPreflightRule } from './rules/design-preflight.js';
import { errorJournalRule } from './rules/error-journal.js';
import { nextStepsRule } from './rules/next-steps.js';
import { resolveIconsPostEnrich, resolveIconsPreTransform } from './rules/resolve-icons.js';
import { responseSizeGuardRule } from './rules/response-size.js';
import {
  recordCreationDebtRule,
  recordVerificationRule,
  verificationDebtRemindRule,
} from './rules/verification-debt.js';

/**
 * Create and configure the harness pipeline with all rules.
 *
 * Code-type rules (packages/core-mcp/src/harness/rules/):
 * - design-preflight: Layer 0 guard — require get_mode before UI creation
 * - resolve-icons: Layer 1 transform — convert icon children to SVGs
 * - content-warnings: Layer 2 enrich — detect placeholder text
 * - auto-verify: Layer 2 enrich — auto lint root-level creations
 * - verification-debt-remind: Layer 2 enrich — persistent debt reminders
 * - response-size-guard: Layer 2 enrich — auto-truncate large responses
 * - design-decisions: Layer 5 session — extract color/font/radius/spacing
 * - record-creation-debt: Layer 5 session — track unverified creations
 * - record-verification: Layer 5 session — clear debt on verify_design
 * - error-journal: Layer 5 session — cross-turn error tracking
 *
 * Data-type rules (content/harness/*.yaml → _harness.ts):
 * - 6 error recovery patterns (Layer 4)
 * - next-steps guidance (Layer 2)
 */
export function createHarnessPipeline(bridge: Bridge): HarnessPipeline {
  const pipeline = new HarnessPipeline();

  // Layer 0: Pre-guards
  pipeline.register(designPreflightRule);

  // Layer 1: Pre-transforms
  pipeline.register(resolveIconsPreTransform);

  // Layer 2: Post-enrich
  pipeline.register(contentWarningsRule);
  pipeline.register(resolveIconsPostEnrich);
  pipeline.register(createAutoVerifyRule(bridge));
  pipeline.register(nextStepsRule); // data-driven (content/harness/next-steps.yaml)
  pipeline.register(verificationDebtRemindRule);
  pipeline.register(responseSizeGuardRule);

  // Layer 4: Error recovery — data-driven (content/harness/recovery-patterns.yaml)
  for (const rule of createRecoveryRules()) {
    pipeline.register(rule);
  }

  // Layer 5: Session update
  pipeline.register(createDesignDecisionsRule(bridge));
  pipeline.register(recordCreationDebtRule);
  pipeline.register(recordVerificationRule);
  pipeline.register(errorJournalRule);

  console.error(`[FigCraft harness] pipeline initialized with ${pipeline.ruleCount} rules`);
  return pipeline;
}

export { createHarnessContext, HarnessPipeline } from './pipeline.js';
export type { HarnessContext, HarnessRule } from './types.js';
