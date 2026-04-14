/**
 * Harness Rule: token-binding-failures (Layer 2 — Post-Enrich)
 *
 * Detects non-empty `_tokenBindingFailures` in responses from create_* / nodes
 * handlers and injects self-correcting guidance into `_nextSteps`, so the agent
 * can recover on the next tool call instead of discovering the failure later by
 * reading logs.
 *
 * Why this rule exists:
 * When a user passes `fillVariableName: "text/primary"` (or equivalent) and the
 * variable lookup returns null (wrong name, unpublished, unsubscribed collection,
 * scope mismatch, etc.), `applyFill` in node-helpers.ts returns early without
 * writing any fill — the node keeps Figma's default color, visually
 * indistinguishable from an intentional hardcoded color. The failure IS recorded
 * in `_tokenBindingFailures`, but it was only a sibling field in the response,
 * never surfaced in `_nextSteps`. Agents routinely missed it and had to re-run
 * `variables_ep(batch_bind)` after the fact.
 *
 * This rule runs AFTER `nextStepsRule` (priority 80 vs this rule's 90) and
 * merges its guidance with any existing `_nextSteps` instead of overwriting.
 */

import type { HarnessAction, HarnessRule } from '../types.js';
import { PASS } from '../types.js';

interface TokenBindingFailure {
  requested: string;
  type: 'variable' | 'style';
  action: 'skipped' | 'used_fallback' | 'scope-mismatch' | 'ambiguous';
}

function isTokenBindingFailure(v: unknown): v is TokenBindingFailure {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as TokenBindingFailure).requested === 'string' &&
    ((v as TokenBindingFailure).type === 'variable' || (v as TokenBindingFailure).type === 'style')
  );
}

/**
 * Collect `_tokenBindingFailures` from every shape it can appear in:
 *   1. Top-level `result._tokenBindingFailures` — used by single-mode handlers
 *      (create_frame, create_text, create_component) AND by batch handlers
 *      that correctly aggregate per-item failures to the top
 *      (create_component batch, create_frame batch, create_text batch).
 *   2. `result.results[]._tokenBindingFailures` — used by `patch_nodes`
 *      (nodes.update endpoint), where each patched node reports its own
 *      binding failures in the per-entry result (write-nodes.ts:676-680).
 *   3. `result.items[]._tokenBindingFailures` — defensive fallback. No current
 *      handler produces this shape, but the cost of scanning is negligible and
 *      future batch handlers might use it.
 */
function collectFailures(result: unknown): TokenBindingFailure[] {
  if (!result || typeof result !== 'object') return [];
  const r = result as Record<string, unknown>;
  const out: TokenBindingFailure[] = [];

  const pushFrom = (arr: unknown): void => {
    if (!Array.isArray(arr)) return;
    for (const f of arr) if (isTokenBindingFailure(f)) out.push(f);
  };

  pushFrom(r._tokenBindingFailures);

  for (const key of ['results', 'items'] as const) {
    const arr = r[key];
    if (!Array.isArray(arr)) continue;
    for (const entry of arr) {
      if (entry && typeof entry === 'object') {
        pushFrom((entry as Record<string, unknown>)._tokenBindingFailures);
      }
    }
  }

  return out;
}

function formatSteps(failures: TokenBindingFailure[]): string[] {
  // Deduplicate by `${requested}|${action}` so a batch creating 24 text nodes
  // with the same missing variable doesn't produce 24 identical lines.
  const seen = new Set<string>();
  const unique: TokenBindingFailure[] = [];
  for (const f of failures) {
    const key = `${f.requested}|${f.action}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(f);
    }
  }

  const summary =
    `⛔ ${failures.length} variable/style binding${failures.length === 1 ? '' : 's'} ` +
    `were NOT applied — affected nodes kept Figma's default color (NOT the value you intended). ` +
    `This is visually indistinguishable from an intentional hardcoded color, so the design ` +
    `looks "correct" but is untokened.`;

  const failureList = `Unresolved: ${unique
    .map((f) => `"${f.requested}" (${f.type}, ${f.action})`)
    .slice(0, 10)
    .join(', ')}${unique.length > 10 ? ` … +${unique.length - 10} more` : ''}`;

  const recovery =
    `To recover on your NEXT call: ` +
    `(a) verify the name via search_design_system(query:"<name>") or variables_ep(method:"list", type:"COLOR"); ` +
    `(b) rebind by ID via variables_ep(method:"batch_bind", bindings:[{nodeId, field:"fills", variableId:"VariableID:..."}, ...]) — ` +
    `this path bypasses name resolution entirely and is the canonical recovery tool; ` +
    `(c) if the "action" is "scope-mismatch", the variable exists but its scopes don't include ` +
    `TEXT_FILL/ALL_FILLS (for textColor role) — figcraft's strict path rejects it, but batch_bind by ID will succeed; ` +
    `(d) if "action" is "ambiguous", multiple variables matched the name — pass fillVariableId to disambiguate.`;

  return [summary, failureList, recovery];
}

export const tokenBindingFailuresRule: HarnessRule = {
  name: 'token-binding-failures',
  // Any write tool that may emit _tokenBindingFailures. '*' is intentional
  // because the field is produced by 6 different handlers (create_frame,
  // create_text, create_component, create_*, nodes.update, instance creation,
  // image-vector) — listing them exactly would drift as new handlers land.
  tools: ['*'],
  phase: 'post-enrich',
  // Priority 90 runs AFTER nextStepsRule (80) so we can merge-append our
  // guidance into any `_nextSteps` that rule already set.
  priority: 90,

  async execute(ctx): Promise<HarnessAction> {
    if (ctx.error) return PASS;
    if (!ctx.result || typeof ctx.result !== 'object') return PASS;

    const failures = collectFailures(ctx.result);
    if (failures.length === 0) return PASS;

    const ourSteps = formatSteps(failures);

    // Merge with whatever nextStepsRule (priority 80, runs first) already
    // injected. pipeline.ts:95 does `Object.assign(r, action.fields)` which
    // overwrites, so we must read the current value and return the merged
    // array.
    const existing = (ctx.result as Record<string, unknown>)._nextSteps;
    const merged =
      Array.isArray(existing) && existing.every((s) => typeof s === 'string')
        ? [...ourSteps, ...(existing as string[])]
        : ourSteps;

    return {
      type: 'enrich',
      fields: { _nextSteps: merged },
    };
  },
};
