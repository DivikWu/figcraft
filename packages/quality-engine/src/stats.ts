/**
 * Lint rule violation statistics — lightweight, session-scoped.
 *
 * Tracks how often each rule triggers violations during the current MCP session.
 * Used to dynamically prioritize prevention checklist items (high-frequency rules first)
 * and provide visibility into which rules are most valuable.
 *
 * Not persisted — resets on MCP server restart. This is intentional:
 * session-level frequency reflects the current design task, not historical usage.
 */

export interface RuleStatEntry {
  totalChecks: number;
  totalViolations: number;
  autoFixed: number;
  lastSeen: string; // ISO date
}

export type RuleStats = Record<string, RuleStatEntry>;

// Session-scoped singleton
const stats: RuleStats = {};

/**
 * Record violations from a lint run.
 * Call after every runLint() with the resulting violations.
 */
export function recordLintRun(
  violations: Array<{ rule: string; autoFixable?: boolean }>,
  rulesChecked: string[],
): void {
  const now = new Date().toISOString();

  // Increment check count for all rules that were active
  for (const ruleName of rulesChecked) {
    if (!stats[ruleName]) {
      stats[ruleName] = { totalChecks: 0, totalViolations: 0, autoFixed: 0, lastSeen: now };
    }
    stats[ruleName].totalChecks++;
  }

  // Increment violation counts
  for (const v of violations) {
    if (!stats[v.rule]) {
      stats[v.rule] = { totalChecks: 0, totalViolations: 0, autoFixed: 0, lastSeen: now };
    }
    stats[v.rule].totalViolations++;
    stats[v.rule].lastSeen = now;
  }
}

/**
 * Record auto-fixed violations.
 */
export function recordAutoFixes(fixes: Array<{ rule: string }>): void {
  const now = new Date().toISOString();
  for (const f of fixes) {
    if (!stats[f.rule]) {
      stats[f.rule] = { totalChecks: 0, totalViolations: 0, autoFixed: 0, lastSeen: now };
    }
    stats[f.rule].autoFixed++;
  }
}

/**
 * Get current session stats, optionally sorted by violation frequency.
 */
export function getStats(sortBy?: 'frequency'): RuleStats {
  if (!sortBy) return { ...stats };

  // Sort by totalViolations descending
  const entries = Object.entries(stats).sort(([, a], [, b]) => b.totalViolations - a.totalViolations);
  const sorted: RuleStats = {};
  for (const [name, entry] of entries) {
    sorted[name] = entry;
  }
  return sorted;
}

/**
 * Get rule names sorted by violation frequency (most violations first).
 * Used by getPreventionChecklist to prioritize high-frequency rules.
 */
export function getRuleFrequencyOrder(): string[] {
  return Object.entries(stats)
    .filter(([, entry]) => entry.totalViolations > 0)
    .sort(([, a], [, b]) => b.totalViolations - a.totalViolations)
    .map(([name]) => name);
}

/** Reset all stats (for testing). */
export function resetStats(): void {
  for (const key of Object.keys(stats)) {
    delete stats[key];
  }
  for (const key of Object.keys(interactiveStats)) {
    delete interactiveStats[key];
  }
  interactiveStats.__null__ = { count: 0, confidenceSum: 0, declaredCount: 0, inferredCount: 0, lastSignals: [] };
}

// ─── Interactive classifier telemetry ────────────────────────────────
// Session-scoped distribution over classified InteractiveKind — used during
// Phase 0 rollout to tune classifier weights against real files. Not persisted.

export interface InteractiveStatEntry {
  count: number;
  confidenceSum: number;
  declaredCount: number;
  inferredCount: number;
  /** Most recent signals list for quick debugging (bounded). */
  lastSignals: string[];
}

const interactiveStats: Record<string, InteractiveStatEntry> = {
  __null__: { count: 0, confidenceSum: 0, declaredCount: 0, inferredCount: 0, lastSignals: [] },
};

/**
 * Record one classification outcome. `kind === null` tracks ambiguous /
 * low-confidence nodes so we can tune thresholds.
 */
export function recordInteractiveClassification(
  kind: string | null,
  confidence: number,
  declared: boolean,
  signals: readonly string[] | undefined,
): void {
  const key = kind ?? '__null__';
  if (!interactiveStats[key]) {
    interactiveStats[key] = { count: 0, confidenceSum: 0, declaredCount: 0, inferredCount: 0, lastSignals: [] };
  }
  const entry = interactiveStats[key];
  entry.count++;
  entry.confidenceSum += confidence;
  if (declared) entry.declaredCount++;
  else entry.inferredCount++;
  if (signals && signals.length > 0) entry.lastSignals = signals.slice(0, 8);
}

/** Get current session's classifier distribution, keyed by kind (or "__null__"). */
export function getInteractiveClassificationStats(): Record<
  string,
  InteractiveStatEntry & { avgConfidence: number }
> {
  const out: Record<string, InteractiveStatEntry & { avgConfidence: number }> = {};
  for (const [key, entry] of Object.entries(interactiveStats)) {
    out[key] = {
      ...entry,
      avgConfidence: entry.count > 0 ? entry.confidenceSum / entry.count : 0,
    };
  }
  return out;
}
