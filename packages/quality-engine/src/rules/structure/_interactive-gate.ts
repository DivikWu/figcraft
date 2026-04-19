/**
 * Shared gate helpers for variant-aware interactive rules.
 *
 * Each variant rule fires only when the engine's classifier has committed to
 * the matching kind with adequate confidence. Declared metadata (plugin data)
 * carries confidence 1 and short-circuits to always-commit.
 */

import type { InteractiveKind } from '../../interactive/taxonomy.js';
import type { AbstractNode } from '../../types.js';

/** Minimum confidence to activate a variant rule when kind was inferred (not declared). */
export const VARIANT_RULE_MIN_CONFIDENCE = 0.7;

/**
 * True when `node.interactive.kind` matches one of the allowed kinds AND meets
 * the confidence bar (declared always passes).
 */
export function matchesInteractiveKind(node: AbstractNode, allowed: readonly InteractiveKind[]): boolean {
  const meta = node.interactive;
  if (!meta?.kind) return false;
  if (!allowed.includes(meta.kind)) return false;
  if (meta.declared) return true;
  return (meta.confidence ?? 0) >= VARIANT_RULE_MIN_CONFIDENCE;
}
