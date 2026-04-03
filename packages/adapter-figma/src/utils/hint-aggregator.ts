/**
 * Hint aggregation — typed hint collection + batch-level deduplication.
 *
 * Handlers emit typed Hint objects during creation. The aggregator
 * suppresses confirmations, deduplicates suggest/warn by normalized key,
 * and batches hardcoded color warnings into a single summary.
 */

// ─── Types ──────────────────────────────────────────────────────

export type HintType = 'confirm' | 'error' | 'suggest' | 'warn';

export interface Hint {
  type: HintType;
  message: string;
}

/** Typed hint emitted during node creation — replaces legacy string format. */
export interface StructuredHint {
  confidence: 'deterministic' | 'ambiguous';
  field: string;
  value: unknown;
  path?: string;
  reason: string;
}

// ─── Deduplication ──────────────────────────────────────────────

/** Normalize a hint message for dedup: strip quoted strings, parens, brackets. */
function hintKey(h: Hint): string {
  return h.message
    .replace(/'[^']*'/g, "'…'")
    .replace(/"[^"]*"/g, '"…"')
    .replace(/\([^)]*\)/g, '(…)')
    .replace(/\[[^\]]*\]/g, '[…]');
}

// ─── Aggregation ────────────────────────────────────────────────

/**
 * Aggregate per-item hints into batch-level warnings.
 *
 * - `confirm` hints are suppressed (they're informational only)
 * - `error` hints are kept as-is
 * - `suggest` and `warn` hints are deduplicated by normalized key
 * - Hardcoded color hints are batched into a single summary message
 */
export function aggregateHints(allHints: Hint[]): string[] {
  const warnings: string[] = [];
  const grouped = new Map<string, { count: number; example: string }>();
  const hardcodedColors = new Set<string>();
  const HARDCODED_RE = /^Hardcoded color (#[0-9a-f]{6,8})/i;

  for (const hint of allHints) {
    if (hint.type === 'confirm') continue;
    if (hint.type === 'error') {
      warnings.push(hint.message);
      continue;
    }
    // Batch hardcoded color hints
    const colorMatch = hint.message.match(HARDCODED_RE);
    if (colorMatch) {
      hardcodedColors.add(colorMatch[1]);
      continue;
    }
    // suggest / warn — deduplicate by normalized key
    const key = hintKey(hint);
    const entry = grouped.get(key);
    if (entry) entry.count++;
    else grouped.set(key, { count: 1, example: hint.message });
  }

  for (const [, { count, example }] of grouped) {
    warnings.push(count > 1 ? `(×${count}) ${example}` : example);
  }

  if (hardcodedColors.size > 0) {
    const colors = [...hardcodedColors].join(', ');
    warnings.push(`Hardcoded colors: [${colors}]. Bind with fillVariableName/strokeVariableName.`);
  }

  return warnings;
}

/**
 * Convert structured hints to typed Hints for aggregation.
 * deterministic → confirm (informational), ambiguous → warn (agent may want to override).
 */
export function structuredHintsToTyped(hints: StructuredHint[]): Hint[] {
  return hints.map((h) => ({
    type: h.confidence === 'deterministic' ? ('confirm' as const) : ('warn' as const),
    message: `${h.field} → ${JSON.stringify(h.value)} (${h.reason})`,
  }));
}

/**
 * Convert legacy string hints (from inferLayoutMode/inferChildSizing) to typed Hints.
 * Parses the `[confidence] ...` format.
 * @deprecated Use structuredHintsToTyped with StructuredHint[] instead.
 */
export function legacyHintsToTyped(hints: string[]): Hint[] {
  return hints.map((h) => {
    if (h.startsWith('[deterministic]'))
      return { type: 'confirm' as const, message: h.replace(/^\[deterministic\]\s*/, '') };
    if (h.startsWith('[ambiguous]')) return { type: 'warn' as const, message: h.replace(/^\[ambiguous\]\s*/, '') };
    return { type: 'suggest' as const, message: h };
  });
}
