/**
 * DesignSession — manages design state that accumulates across tool calls.
 *
 * Extracted from Bridge to separate connection management (transport layer)
 * from design workflow state (business layer).
 *
 * Lifecycle:
 *   - Created once per Bridge instance
 *   - reset() on mode change (set_mode) — clears all accumulated state
 *   - State accumulates across create_frame calls for cross-screen consistency
 */

/** Accumulated design decisions for cross-screen consistency. */
export interface DesignDecisions {
  fillsUsed: string[];
  fontsUsed: string[];
  radiusValues: number[];
  spacingValues: number[];
  elevationStyle?: 'flat' | 'subtle' | 'elevated';
}

export class DesignSession {
  // ─── Mode state ───

  private _selectedLibrary: string | null | undefined = undefined;
  private _modeQueried = false;

  // ─── Workflow caching ───

  private _lastWorkflowHash: string | null = null;

  // ─── Design decisions ───

  /** Accumulated design decisions in creator mode (no library). */
  private _designDecisions: DesignDecisions | null = null;
  /** Accumulated fallback decisions in library mode (hex colors/fonts when token binding unavailable). */
  private _libraryFallbackDecisions: DesignDecisions | null = null;
  /** Cached designContext.defaults from last get_mode in library mode (role→variable mapping). */
  private _designContextDefaults: Record<string, { name: string } | null> | null = null;
  /** Saved design decisions from creator mode when migrating to library mode. Cleared after first get_mode. */
  private _migrationContext: DesignDecisions | null = null;

  // ─── REST component cache ───

  private _restComponentCache: { fileKey: string; data: unknown; ts: number } | null = null;
  private static readonly REST_CACHE_TTL_MS = 300_000; // 5 min

  // ─── Mode state accessors ───

  /**
   * Currently selected library name (cached from get_mode / set_mode).
   * - `undefined` = unknown (never queried this session)
   * - `null` = explicitly no library selected
   * - `string` = library name or '__local__'
   */
  get selectedLibrary(): string | null | undefined {
    return this._selectedLibrary;
  }

  set selectedLibrary(value: string | null) {
    this._selectedLibrary = value;
  }

  /** Whether get_mode or set_mode has been called this session. */
  get modeQueried(): boolean {
    return this._modeQueried;
  }

  /**
   * Mark mode as queried (true) or reset mode state (false).
   * Setting to false triggers a full reset of accumulated design state —
   * this is intentional because a mode change invalidates all prior
   * design decisions, workflow cache, and library defaults.
   */
  set modeQueried(value: boolean) {
    this._modeQueried = value;
    if (!value) {
      this._lastWorkflowHash = null;
      this._designDecisions = null;
      this._libraryFallbackDecisions = null;
      this._designContextDefaults = null;
    }
  }

  // ─── Workflow caching ───

  get lastWorkflowHash(): string | null {
    return this._lastWorkflowHash;
  }

  set lastWorkflowHash(value: string | null) {
    this._lastWorkflowHash = value;
  }

  // ─── Design decisions ───

  get designDecisions(): DesignDecisions | null {
    return this._designDecisions;
  }

  get libraryFallbackDecisions(): DesignDecisions | null {
    return this._libraryFallbackDecisions;
  }

  /** Merge new design decisions into accumulated state. */
  mergeDesignDecisions(partial: Partial<DesignDecisions>, target?: 'libraryFallback'): void {
    const field = target === 'libraryFallback' ? '_libraryFallbackDecisions' : '_designDecisions';
    if (!this[field]) {
      this[field] = { fillsUsed: [], fontsUsed: [], radiusValues: [], spacingValues: [] };
    }
    const d = this[field]!;
    if (partial.fillsUsed) {
      for (const f of partial.fillsUsed) if (!d.fillsUsed.includes(f)) d.fillsUsed.push(f);
    }
    if (partial.fontsUsed) {
      for (const f of partial.fontsUsed) if (!d.fontsUsed.includes(f)) d.fontsUsed.push(f);
    }
    if (partial.radiusValues) {
      for (const v of partial.radiusValues) if (!d.radiusValues.includes(v)) d.radiusValues.push(v);
    }
    if (partial.spacingValues) {
      for (const v of partial.spacingValues) if (!d.spacingValues.includes(v)) d.spacingValues.push(v);
    }
    if (partial.elevationStyle) d.elevationStyle = partial.elevationStyle;
  }

  /** Clear design decisions (called on disconnect). */
  clearDesignDecisions(): void {
    this._designDecisions = null;
    this._libraryFallbackDecisions = null;
  }

  // ─── Migration context ───

  /**
   * Save current design decisions as migration context before switching to library mode.
   * The context is consumed (and cleared) by the next get_mode call.
   */
  saveMigrationContext(): void {
    if (this._designDecisions) {
      this._migrationContext = { ...this._designDecisions };
    }
  }

  /** Consume and clear migration context (called by get_mode after mode switch). */
  consumeMigrationContext(): DesignDecisions | null {
    const ctx = this._migrationContext;
    this._migrationContext = null;
    return ctx;
  }

  // ─── Design context defaults ───

  get designContextDefaults(): Record<string, { name: string } | null> | null {
    return this._designContextDefaults;
  }

  set designContextDefaults(value: Record<string, { name: string } | null> | null) {
    this._designContextDefaults = value;
  }

  // ─── REST component cache ───

  /** Cache REST library component data (5min TTL). */
  setRestComponentCache(fileKey: string, data: unknown): void {
    this._restComponentCache = { fileKey, data, ts: Date.now() };
  }

  /** Get cached REST library component data if still valid. */
  getRestComponentCache(fileKey: string): unknown | null {
    if (!this._restComponentCache) return null;
    if (this._restComponentCache.fileKey !== fileKey) return null;
    if (Date.now() - this._restComponentCache.ts > DesignSession.REST_CACHE_TTL_MS) {
      this._restComponentCache = null;
      return null;
    }
    return this._restComponentCache.data;
  }

  // ─── Verification Debt ───

  /** Tracks root-level creations that haven't been verified via verify_design/lint_fix_all. */
  private _unverifiedCreations: Array<{ nodeId: string; name: string; ts: number }> = [];

  /** Record a single creation for debt tracking. */
  recordCreation(nodeId: string, name: string): void {
    this._unverifiedCreations.push({ nodeId, name, ts: Date.now() });
  }

  /** Record multiple creations (batch/items[] mode). */
  recordCreations(items: Array<{ nodeId: string; name: string }>): void {
    const ts = Date.now();
    for (const item of items) {
      this._unverifiedCreations.push({ ...item, ts });
    }
  }

  /**
   * Clear verification debt.
   * @param nodeId - Clear debt for a specific node. Omit to clear all.
   */
  recordVerification(nodeId?: string): void {
    if (nodeId) {
      this._unverifiedCreations = this._unverifiedCreations.filter((c) => c.nodeId !== nodeId);
    } else {
      this._unverifiedCreations = [];
    }
  }

  /** Number of unverified creations. */
  get verificationDebt(): number {
    return this._unverifiedCreations.length;
  }

  /** List of unverified nodes (for debt reminders). */
  get unverifiedNodes(): Array<{ nodeId: string; name: string }> {
    return this._unverifiedCreations.map(({ nodeId, name }) => ({ nodeId, name }));
  }

  // ─── Error Journal ───

  /** Tracks recent errors for cross-turn learning. */
  private _errorJournal: Array<{ tool: string; errorType: string; detail: string; ts: number }> = [];

  /** Max age for error journal entries (1 hour). */
  private static readonly ERROR_JOURNAL_TTL_MS = 3_600_000;

  /** Record an error for cross-turn learning. Keeps last 10 entries, expires after 1 hour. */
  recordError(tool: string, errorType: string, detail: string): void {
    const now = Date.now();
    // Expire old entries
    this._errorJournal = this._errorJournal.filter((e) => now - e.ts < DesignSession.ERROR_JOURNAL_TTL_MS);
    this._errorJournal.push({ tool, errorType, detail, ts: now });
    if (this._errorJournal.length > 10) this._errorJournal.shift();
  }

  /**
   * Get recent errors for injection into _workflow.
   * @param tool - Filter by tool name (optional).
   * @returns Most recent 3 relevant error summaries.
   */
  getRecentErrors(tool?: string): string[] {
    const now = Date.now();
    return this._errorJournal
      .filter((e) => now - e.ts < DesignSession.ERROR_JOURNAL_TTL_MS && (!tool || e.tool === tool))
      .slice(-3)
      .map((e) => `[${e.tool}] ${e.errorType}: ${e.detail}`);
  }

  // ─── Full reset ───

  /** Reset all session state. Called on mode change or when starting fresh. */
  reset(): void {
    this._modeQueried = false;
    this._selectedLibrary = undefined;
    this._lastWorkflowHash = null;
    this._designDecisions = null;
    this._libraryFallbackDecisions = null;
    this._designContextDefaults = null;
    this._migrationContext = null;
    this._restComponentCache = null;
    this._unverifiedCreations = [];
    this._errorJournal = [];
  }
}
