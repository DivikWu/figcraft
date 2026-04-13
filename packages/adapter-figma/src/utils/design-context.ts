/**
 * Design context — lazy per-collection caching, typography matching, auto-binding.
 *
 * Architecture:
 * - get_mode returns lightweight collection index + defaults (no variable lists)
 * - Variables loaded per-collection on first use
 * - Typography mapping built on first text creation (imports font-size vars to read values)
 */

import { LOCAL_LIBRARY, STORAGE_KEYS } from '../constants.js';
import { registerCache } from './cache-manager.js';

// ─── Types ───

export interface DesignVariable {
  name: string;
  key: string;
  resolvedType: string;
}

export interface CollectionInfo {
  key: string;
  name: string;
  libraryName: string;
}

export interface DesignContextResult {
  source: 'library' | 'local';
  libraryName: string | null;
  collections: Array<{ name: string; key: string }>;
  defaults: Record<string, DesignVariable | null>;
  /** Roles where no matching variable was found — helps agent know which bindings will be skipped. */
  unresolvedDefaults?: string[];
  /** COLOR variables grouped by first path segment — lets AI self-select when defaults are unresolved. */
  availableColorVariables?: Record<string, string[]>;
  typographyScales: string[];
  registeredStyles?: {
    textStyleCount: number;
    textStyles: Array<{ name: string; fontSize: number; fontFamily: string }>;
    paintStyleCount: number;
    paintStyles: Array<{ name: string; hex: string }>;
    effectStyleCount: number;
    effectStyles: Array<{ name: string; effectType: string }>;
    _note?: string;
  };
}

export interface TypographyBinding {
  scale: string;
  fontSize: DesignVariable;
  fontFamily: DesignVariable | null;
  fontWeight: DesignVariable | null;
  lineHeight: DesignVariable | null;
}

// ─── Timeout helper ───

/** Race a promise against a timeout. Returns fallback on timeout instead of rejecting. Cleans up timer on resolve. */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T, label?: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<T>((resolve) => {
      timer = setTimeout(() => {
        console.warn(`[figcraft] ${label ?? 'operation'} timed out after ${ms}ms`);
        resolve(fallback);
      }, ms);
    }),
  ]);
}

/** Race a promise against a timeout. Rejects on timeout. Cleans up timer on resolve. */
function withTimeoutReject<T>(promise: Promise<T>, ms: number, label?: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label ?? 'operation'} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

/** Timeout for individual Figma API network calls (import, collection fetch). */
const API_CALL_TIMEOUT_MS = 8_000;

// ─── Shared library collections fetcher (dedup + TTL cache) ───
// getAvailableLibraryVariableCollectionsAsync is the single slowest API call (~1-8s).
// Multiple call sites (sendLibraryList, getCollectionIndex, lint, search) hit it independently.
// This shared fetcher ensures at most one inflight request + a short TTL cache.

const LIBRARY_COLLECTIONS_TTL_MS = 30_000;
let _libraryCollectionsCache: { data: LibraryVariableCollection[]; ts: number } | null = null;
let _libraryCollectionsInflight: Promise<LibraryVariableCollection[]> | null = null;

/** Fetch available library variable collections with dedup + 30s TTL cache. */
export function getAvailableLibraryCollectionsCached(): Promise<LibraryVariableCollection[]> {
  if (_libraryCollectionsCache && Date.now() - _libraryCollectionsCache.ts < LIBRARY_COLLECTIONS_TTL_MS) {
    return Promise.resolve(_libraryCollectionsCache.data);
  }
  if (_libraryCollectionsInflight) return _libraryCollectionsInflight;

  _libraryCollectionsInflight = withTimeout(
    figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync(),
    API_CALL_TIMEOUT_MS,
    [],
    'getAvailableLibraryVariableCollections(cached)',
  )
    .then((data) => {
      _libraryCollectionsCache = { data, ts: Date.now() };
      _libraryCollectionsInflight = null;
      return data;
    })
    .catch((err) => {
      _libraryCollectionsInflight = null;
      throw err;
    });

  return _libraryCollectionsInflight;
}

/** Timeout for aggregate auto-bind operations. */
const AUTO_BIND_TIMEOUT_MS = 6_000;

// ─── Variable import cache ───
// importVariableByKeyAsync is a network call (~100-2000ms each).
// The same variable key (e.g. text/primary, surface/primary) is imported repeatedly
// across multiple node creations. Cache the result to avoid redundant network round-trips.
const _variableImportCache = new Map<string, Variable>();

/** Maximum number of cached variable imports to prevent unbounded memory growth. */
const VARIABLE_CACHE_MAX_SIZE = 500;

/** Import a variable by key, using in-memory cache to avoid repeated network calls. */
async function cachedImportVariable(key: string, label?: string): Promise<Variable> {
  const cached = _variableImportCache.get(key);
  if (cached) return cached;

  const imported = await withTimeoutReject(
    figma.variables.importVariableByKeyAsync(key),
    API_CALL_TIMEOUT_MS,
    label ?? `importVariable(${key})`,
  );

  // Evict oldest entries when cache exceeds max size
  if (_variableImportCache.size >= VARIABLE_CACHE_MAX_SIZE) {
    const firstKey = _variableImportCache.keys().next().value;
    if (firstKey !== undefined) _variableImportCache.delete(firstKey);
  }

  _variableImportCache.set(key, imported);
  return imported;
}

// ─── Caches ───

// Collection index: library name → collection list
let indexCache: { library: string; collections: CollectionInfo[] } | null = null;

// Per-collection variable lists
const collectionVarCache = new Map<string, DesignVariable[]>();

// Color defaults cache (for autoBindDefault)
let defaultsCache: { library: string; defaults: Record<string, DesignVariable | null> } | null = null;

// Typography: fontSize value → TypographyBinding
let typoMapCache: { library: string; map: Map<number, TypographyBinding> } | null = null;

// Semantic role → candidate variable name patterns (first match wins)
// Can be overridden per-library via clientStorage key 'figcraft_role_mappings_<library>'
const DEFAULT_MAPPINGS: Record<string, string[]> = {
  // Text colors
  textColor: ['text/primary', 'text/default', 'color/text/primary', 'colors/text-primary'],
  headingColor: ['text/heading', 'text/primary', 'color/text/heading', 'colors/text-heading'],
  textSecondary: ['text/secondary', 'text/muted', 'color/text/secondary', 'colors/text-secondary'],
  textDisabled: ['text/disabled', 'text/tertiary', 'color/text/disabled', 'colors/text-disabled'],
  textInverse: ['text/primary-inverse', 'text/inverse', 'text/on-primary', 'color/text/inverse'],
  textBrand: ['text/brand', 'text/accent', 'color/text/brand'],
  textBrandInverse: ['text/brand-inverse', 'text/on-brand', 'color/text/brand-inverse'],
  // Surface / background colors
  background: ['surface/primary', 'surface/default', 'background/primary', 'colors/surface-primary'],
  backgroundSecondary: ['surface/secondary', 'surface/subtle', 'background/secondary', 'colors/surface-secondary'],
  inputBackground: ['surface/input', 'input/background', 'surface/field', 'colors/surface-input', 'surface/secondary'],
  // Border colors
  border: ['border/default', 'border/primary', 'colors/border-default'],
  // Action / interactive colors
  primary: ['fill/primary', 'action/primary', 'brand/primary', 'interactive/primary', 'colors/fill-primary'],
  primaryText: ['text/on-primary', 'text/primary-inverse', 'text/inverse', 'fill/on-primary', 'colors/text-on-primary'],
  // Button colors
  buttonEmphasis: ['button/emphasis', 'button/brand', 'fill/emphasis', 'action/emphasis'],
  buttonEmphasisActive: ['button/emphasis-active', 'button/brand-active', 'fill/emphasis-active'],
  buttonPrimary: ['button/primary', 'fill/primary-button', 'action/primary-button'],
  buttonPrimaryActive: ['button/primary-active', 'fill/primary-button-active'],
  buttonSecondary: ['button/secondary', 'fill/secondary-button', 'action/secondary-button'],
  buttonSecondaryActive: ['button/secondary-active', 'fill/secondary-button-active'],
  buttonTertiary: ['button/tertiary', 'fill/tertiary-button', 'action/tertiary-button'],
  buttonTertiaryActive: ['button/tertiary-active', 'fill/tertiary-button-active'],
  buttonDisabled: ['button/disabled', 'fill/disabled', 'state/disabled', 'action/disabled'],
  // State colors
  error: ['error/default', 'status/error', 'danger/default', 'colors/error-default', 'feedback/error/fill-primary'],
  success: ['success/default', 'status/success', 'colors/success-default', 'feedback/success/fill-primary'],
  warning: ['warning/default', 'status/warning', 'colors/warning-default', 'feedback/warning/fill-primary'],
};

/** Custom role mappings cache (per-library). */
let customMappingsCache: { library: string; mappings: Record<string, string[]> | null } | null = null;

/**
 * Get effective role mappings for a library, merging custom overrides with defaults.
 * Custom mappings are stored in clientStorage as 'figcraft_role_mappings_<library>'.
 */
async function getEffectiveMappings(libraryName: string): Promise<Record<string, string[]>> {
  if (customMappingsCache && customMappingsCache.library === libraryName) {
    return customMappingsCache.mappings ?? DEFAULT_MAPPINGS;
  }
  try {
    const stored = (await figma.clientStorage.getAsync(`${STORAGE_KEYS.ROLE_MAPPINGS_PREFIX}${libraryName}`)) as
      | string
      | undefined;
    if (stored) {
      const custom = JSON.parse(stored) as Record<string, string[]>;
      // Merge: custom entries take precedence, default entries fill gaps
      const merged = { ...DEFAULT_MAPPINGS };
      for (const [role, candidates] of Object.entries(custom)) {
        // Prepend custom candidates before defaults for the same role
        merged[role] = [...candidates, ...(DEFAULT_MAPPINGS[role] ?? [])];
      }
      customMappingsCache = { library: libraryName, mappings: merged };
      return merged;
    }
  } catch (err) {
    console.warn('[figcraft] storage parse error:', err instanceof Error ? err.message : String(err));
  }
  customMappingsCache = { library: libraryName, mappings: null };
  return DEFAULT_MAPPINGS;
}

// ─── Variable library name resolution ───

/**
 * Resolve the variable API library name for a given display name.
 * When a library file is duplicated, the variable API may report a different
 * libraryName than the file's display name. We store this mapping as
 * `variableLibraryName` in the library entries.
 */
async function resolveVariableLibraryName(displayName: string): Promise<string> {
  if (displayName === LOCAL_LIBRARY) return displayName;
  try {
    const entriesRaw = (await figma.clientStorage.getAsync(STORAGE_KEYS.LIBRARY_URLS)) as Record<
      string,
      { name: string; variableLibraryName?: string }
    > | null;
    if (entriesRaw && typeof entriesRaw === 'object') {
      for (const entry of Object.values(entriesRaw)) {
        if (entry && entry.name === displayName && entry.variableLibraryName) {
          return entry.variableLibraryName;
        }
      }
    }
  } catch (err) {
    console.warn('[figcraft] storage write error:', err instanceof Error ? err.message : String(err));
  }
  return displayName;
}

// ─── Collection index (lightweight) ───

async function getCollectionIndex(libraryName: string): Promise<CollectionInfo[]> {
  if (indexCache && indexCache.library === libraryName) {
    return indexCache.collections;
  }
  // Resolve the actual variable API name (may differ from display name)
  const resolvedName = await resolveVariableLibraryName(libraryName);

  const all = await getAvailableLibraryCollectionsCached();
  const collections = all
    .filter((c) => c.libraryName === resolvedName)
    .map((c) => ({ key: c.key, name: c.name, libraryName: c.libraryName }));
  indexCache = { library: libraryName, collections };
  return collections;
}

// ─── Per-collection variable loading (lazy) ───

async function getCollectionVariables(collectionKey: string): Promise<DesignVariable[]> {
  if (collectionVarCache.has(collectionKey)) {
    return collectionVarCache.get(collectionKey)!;
  }
  const vars = await withTimeout(
    figma.teamLibrary.getVariablesInLibraryCollectionAsync(collectionKey),
    API_CALL_TIMEOUT_MS,
    [],
    `getVariablesInLibraryCollection(${collectionKey})`,
  );
  const result = vars.map((v) => ({ name: v.name, key: v.key, resolvedType: v.resolvedType }));
  collectionVarCache.set(collectionKey, result);
  return result;
}

// ─── Defaults resolution (loads only color collection) ───

async function resolveDefaults(libraryName: string): Promise<Record<string, DesignVariable | null>> {
  if (defaultsCache && defaultsCache.library === libraryName) {
    return defaultsCache.defaults;
  }

  const collections = await getCollectionIndex(libraryName);
  // Find color-related collections — match flexibly since libraries use varied naming
  // (e.g. "color", "Colors", "Color Tokens", "semantic/color", "primitives")
  const colorCols = collections.filter((c) => {
    const n = c.name.toLowerCase();
    return n === 'color' || n === 'colors' || n.includes('color') || n.includes('semantic');
  });

  let allColorVars: DesignVariable[] = [];
  if (colorCols.length > 0) {
    // Load variables from all matching collections in parallel
    const results = await Promise.all(colorCols.map((c) => getCollectionVariables(c.key)));
    allColorVars = results.flat();
  }

  const nameMap = new Map(allColorVars.map((v) => [v.name, v]));
  const defaults: Record<string, DesignVariable | null> = {};

  const mappings = await getEffectiveMappings(libraryName);
  for (const [role, candidates] of Object.entries(mappings)) {
    defaults[role] = null;
    for (const name of candidates) {
      if (nameMap.has(name)) {
        defaults[role] = nameMap.get(name)!;
        break;
      }
    }
  }

  defaultsCache = { library: libraryName, defaults };
  return defaults;
}

// ─── Typography scale extraction ───

function extractTypographyScales(variables: DesignVariable[]): string[] {
  const scales = new Set<string>();
  for (const v of variables) {
    const parts = v.name.split('/');
    if (parts.length >= 2) scales.add(parts[0]);
  }
  return [...scales];
}

// ─── Typography mapping (lazy, imports font-size vars to read values) ───

async function getTypographyMapping(libraryName: string): Promise<Map<number, TypographyBinding>> {
  if (typoMapCache && typoMapCache.library === libraryName) {
    return typoMapCache.map;
  }

  const collections = await getCollectionIndex(libraryName);
  const typoCol = collections.find((c) => c.name.includes('typography') && !c.name.includes('primitives'));
  if (!typoCol) {
    const emptyMap = new Map<number, TypographyBinding>();
    typoMapCache = { library: libraryName, map: emptyMap };
    return emptyMap;
  }

  const vars = await getCollectionVariables(typoCol.key);
  const scales = extractTypographyScales(vars);
  const varByName = new Map(vars.map((v) => [v.name, v]));

  const map = new Map<number, TypographyBinding>();

  // Collect font-size vars to import in parallel
  const scaleEntries = scales
    .map((scale) => ({ scale, fsVar: varByName.get(`${scale}/font-size`) }))
    .filter((e): e is { scale: string; fsVar: DesignVariable } => !!e.fsVar);

  if (scaleEntries.length === 0) {
    typoMapCache = { library: libraryName, map };
    return map;
  }

  // Import all font-size variables in parallel (with per-item timeout)
  const importResults = await Promise.allSettled(
    scaleEntries.map(async (e) => {
      const imported = await cachedImportVariable(e.fsVar.key, `importVariable(${e.fsVar.name})`);
      return { ...e, imported };
    }),
  );

  // Resolve collection once from the first successful import
  let resolvedModeId: string | null = null;
  for (const r of importResults) {
    if (r.status === 'fulfilled') {
      try {
        const collection = await figma.variables.getVariableCollectionByIdAsync(r.value.imported.variableCollectionId);
        if (collection) {
          resolvedModeId = collection.modes[0].modeId;
          break;
        }
      } catch {
        /* try next */
      }
    }
  }

  if (resolvedModeId) {
    for (const r of importResults) {
      if (r.status !== 'fulfilled') continue;
      const { scale, fsVar, imported } = r.value;
      const value = imported.valuesByMode[resolvedModeId];
      if (typeof value !== 'number') continue;

      map.set(value, {
        scale,
        fontSize: fsVar,
        fontFamily: varByName.get(`${scale}/font-family`) ?? null,
        fontWeight: varByName.get(`${scale}/font-weight`) ?? null,
        lineHeight: varByName.get(`${scale}/line-height`) ?? null,
      });
    }
  }

  typoMapCache = { library: libraryName, map };
  return map;
}

// ─── Public API ───

/**
 * Get lightweight design context for get_mode response.
 * Only loads collection index (1 API call), then resolves defaults and typography in parallel.
 */
export async function getLibraryDesignContext(libraryName: string): Promise<DesignContextResult> {
  const collections = await getCollectionIndex(libraryName);

  // Run defaults and typography loading in parallel to avoid sequential 8s+8s+8s
  const typoCol = collections.find((c) => c.name.includes('typography') && !c.name.includes('primitives'));

  const [defaults, typographyScales] = await Promise.all([
    resolveDefaults(libraryName),
    typoCol
      ? getCollectionVariables(typoCol.key)
          .then(extractTypographyScales)
          .catch(() => [] as string[])
      : Promise.resolve([] as string[]),
    // Preheat typography mapping in parallel — avoids cold-start latency on first text creation
    typoCol ? getTypographyMapping(libraryName).catch(() => {}) : Promise.resolve(),
  ]);

  // Compute unresolved defaults for agent awareness
  const unresolvedDefaults = Object.entries(defaults)
    .filter(([, v]) => v === null)
    .map(([role]) => role);

  // Build grouped COLOR variable names from color-hinted collections
  let availableColorVariables: Record<string, string[]> | undefined;
  try {
    const colorHints = ['color', 'semantic', 'theme'];
    const colorCols = collections.filter((c) => colorHints.some((h) => c.name.toLowerCase().includes(h)));
    if (colorCols.length > 0) {
      const allColorVars: DesignVariable[] = [];
      for (const col of colorCols.slice(0, 3)) {
        const vars = await getCollectionVariables(col.key);
        allColorVars.push(...vars.filter((v) => v.resolvedType === 'COLOR'));
      }
      availableColorVariables = buildGroupedColorVars(allColorVars);
    }
  } catch {
    /* best effort */
  }

  return {
    source: 'library',
    libraryName,
    collections: collections.map((c) => ({ name: c.name, key: c.key })),
    defaults,
    ...(unresolvedDefaults.length > 0 ? { unresolvedDefaults } : undefined),
    ...(availableColorVariables ? { availableColorVariables } : undefined),
    typographyScales,
  };
}

/**
 * Get lightweight design context for local file.
 */
export async function getLocalDesignContext(): Promise<DesignContextResult> {
  const localCollections = await figma.variables.getLocalVariableCollectionsAsync();
  const collections = localCollections.map((c) => ({ name: c.name, key: c.id }));

  // Resolve defaults from local color variables (parallel load)
  const allVarIds = localCollections.flatMap((col) => col.variableIds);
  const varResults = await Promise.allSettled(allVarIds.map((varId) => figma.variables.getVariableByIdAsync(varId)));
  const allVars: DesignVariable[] = [];
  for (const r of varResults) {
    if (r.status === 'fulfilled' && r.value) {
      allVars.push({ name: r.value.name, key: r.value.key, resolvedType: r.value.resolvedType });
    }
  }
  const nameMap = new Map(allVars.map((v) => [v.name, v]));
  const defaults: Record<string, DesignVariable | null> = {};
  const mappings = await getEffectiveMappings(LOCAL_LIBRARY);
  for (const [role, candidates] of Object.entries(mappings)) {
    defaults[role] = null;
    for (const name of candidates) {
      if (nameMap.has(name)) {
        defaults[role] = nameMap.get(name)!;
        break;
      }
    }
  }

  // Compute unresolved defaults for agent awareness
  const unresolvedDefaults = Object.entries(defaults)
    .filter(([, v]) => v === null)
    .map(([role]) => role);

  // Build grouped COLOR variable names so AI can self-select when defaults are unresolved
  const availableColorVariables = buildGroupedColorVars(allVars.filter((v) => v.resolvedType === 'COLOR'));

  return {
    source: 'local',
    libraryName: null,
    collections,
    defaults,
    ...(unresolvedDefaults.length > 0 ? { unresolvedDefaults } : undefined),
    availableColorVariables,
    typographyScales: [],
  };
}

/**
 * Group COLOR variables by first path segment for AI self-selection.
 * Returns { text: ["text/primary", "text/primary-inverse", ...], button: ["button/emphasis", ...], ... }
 * Capped at 10 groups × 20 vars per group to control response size.
 */
function buildGroupedColorVars(vars: DesignVariable[]): Record<string, string[]> {
  const MAX_GROUPS = 10;
  const MAX_PER_GROUP = 20;
  const groups = new Map<string, string[]>();
  for (const v of vars) {
    const parts = v.name.split('/');
    const group = parts.length > 1 ? parts[0] : '_ungrouped';
    if (!groups.has(group)) {
      if (groups.size >= MAX_GROUPS) continue;
      groups.set(group, []);
    }
    const list = groups.get(group)!;
    if (list.length < MAX_PER_GROUP) list.push(v.name);
  }
  const result: Record<string, string[]> = {};
  for (const [group, names] of groups) result[group] = names;
  return result;
}

/**
 * Clear all caches — called on library switch.
 */
export function clearDesignContextCache(): void {
  indexCache = null;
  collectionVarCache.clear();
  defaultsCache = null;
  typoMapCache = null;
  customMappingsCache = null;
  _variableImportCache.clear();
  _colorVarCache = null;
  _libraryCollectionsCache = null;
  _libraryCollectionsInflight = null;
}

// Register with centralized cache manager
registerCache('design-context', clearDesignContextCache);

/**
 * Auto-bind a default color variable to a node's fills.
 * Protected by an overall timeout to prevent blocking node creation.
 */
export async function autoBindDefault(
  node: SceneNode & MinimalFillsMixin,
  role: string,
  libraryName: string,
): Promise<string | null> {
  return withTimeout(
    _autoBindDefaultImpl(node, role, libraryName),
    AUTO_BIND_TIMEOUT_MS,
    null,
    `autoBindDefault(${role})`,
  );
}

/**
 * Auto-bind a default color variable to a node's strokes.
 * Mirrors autoBindDefault but operates on strokes instead of fills.
 */
export async function autoBindStrokeDefault(
  node: SceneNode & { strokes: readonly Paint[] | Paint[] },
  role: string,
  libraryName: string,
): Promise<string | null> {
  return withTimeout(
    _autoBindStrokeDefaultImpl(node, role, libraryName),
    AUTO_BIND_TIMEOUT_MS,
    null,
    `autoBindStrokeDefault(${role})`,
  );
}

/**
 * Map an autoBind role name (including text-variants) to the Figma variable
 * scopes that are semantically acceptable for binding. Used as a safety net in
 * _autoBindDefaultImpl so a misconfigured DEFAULT_MAPPINGS (or a library whose
 * `text/primary` variable is mistakenly scoped to `FRAME_FILL`) can't silently
 * bind a wrong-scope variable to a text node.
 *
 * Returns null for roles that have no scope constraint (e.g. `primary`,
 * `error`), meaning the safety net is a no-op for those.
 */
function autoBindRoleScopes(role: string): string[] | null {
  if (role === 'textColor' || role === 'headingColor' || role === 'textSecondary' || role === 'textDisabled') {
    return ['ALL_FILLS', 'TEXT_FILL'];
  }
  if (role === 'background' || role === 'backgroundSecondary' || role === 'inputBackground') {
    return ['ALL_FILLS', 'FRAME_FILL', 'SHAPE_FILL'];
  }
  if (role === 'border') return ['STROKE_COLOR'];
  // primary, primaryText, error, success, warning — no scope constraint, caller decides.
  return null;
}

async function _autoBindDefaultImpl(
  node: SceneNode & MinimalFillsMixin,
  role: string,
  libraryName: string,
): Promise<string | null> {
  try {
    const defaults =
      libraryName === LOCAL_LIBRARY ? (await getLocalDesignContext()).defaults : await resolveDefaults(libraryName);

    const defaultVar = defaults[role];
    if (!defaultVar) return null;

    const variable =
      libraryName === LOCAL_LIBRARY
        ? await figma.variables.getVariableByIdAsync(defaultVar.key)
        : await cachedImportVariable(defaultVar.key, `importVariable(${defaultVar.name})`);

    if (!variable) return null;

    // Safety net: if the role has a defined scope constraint, verify the resolved
    // variable actually accepts it. Guards against misconfigured DEFAULT_MAPPINGS or
    // libraries whose semantic names don't match their Figma scope settings.
    const requiredScopes = autoBindRoleScopes(role);
    if (requiredScopes) {
      const scopes = ((variable as any).scopes as string[] | undefined) ?? [];
      if (!scopesAccept(scopes, requiredScopes)) {
        console.warn(
          `[figcraft] autoBindDefault: skipping "${defaultVar.name}" for role "${role}" — ` +
            `variable scopes [${scopes.join(', ')}] don't accept required [${requiredScopes.join(', ')}]. ` +
            `Check DEFAULT_MAPPINGS or the library's variable scope configuration.`,
        );
        return null;
      }
    }

    const fills = [...(node.fills as Paint[])];
    if (fills[0]) {
      fills[0] = figma.variables.setBoundVariableForPaint(fills[0] as SolidPaint, 'color', variable);
      node.fills = fills;
      return defaultVar.name;
    }
    return null;
  } catch (err) {
    console.warn('[figcraft] autoBindDefault failed:', role, err);
    return null;
  }
}

async function _autoBindStrokeDefaultImpl(
  node: SceneNode & { strokes: readonly Paint[] | Paint[] },
  role: string,
  libraryName: string,
): Promise<string | null> {
  try {
    const defaults =
      libraryName === LOCAL_LIBRARY ? (await getLocalDesignContext()).defaults : await resolveDefaults(libraryName);

    const defaultVar = defaults[role];
    if (!defaultVar) return null;

    const variable =
      libraryName === LOCAL_LIBRARY
        ? await figma.variables.getVariableByIdAsync(defaultVar.key)
        : await cachedImportVariable(defaultVar.key, `importVariable(${defaultVar.name})`);

    if (!variable) return null;

    // Safety net: stroke auto-bind should never apply a variable scoped only to
    // fills. autoBindStrokeDefault is always stroke-context, so enforce STROKE_COLOR.
    const scopes = ((variable as any).scopes as string[] | undefined) ?? [];
    if (!scopesAccept(scopes, ['STROKE_COLOR'])) {
      console.warn(
        `[figcraft] autoBindStrokeDefault: skipping "${defaultVar.name}" for role "${role}" — ` +
          `variable scopes [${scopes.join(', ')}] don't include STROKE_COLOR. ` +
          `Check DEFAULT_MAPPINGS or the library's variable scope configuration.`,
      );
      return null;
    }

    const strokes = [...(node.strokes as Paint[])];
    if (strokes.length > 0 && strokes[0]) {
      strokes[0] = figma.variables.setBoundVariableForPaint(strokes[0] as SolidPaint, 'color', variable);
      node.strokes = strokes;
      return defaultVar.name;
    }
    return null;
  } catch (err) {
    console.warn('[figcraft] autoBindStrokeDefault failed:', role, err);
    return null;
  }
}

// ─── Scope-aware color variable matching ───

/** Map binding role to Figma variable scopes that are acceptable for that context. */
const ROLE_TO_SCOPES: Record<string, string[]> = {
  background: ['ALL_FILLS', 'FRAME_FILL', 'SHAPE_FILL'],
  textColor: ['ALL_FILLS', 'TEXT_FILL'],
  border: ['STROKE_COLOR', 'ALL_SCOPES'],
};

/**
 * Check whether a variable's scopes are compatible with the acceptable scopes for a role.
 * Returns true when:
 * - The variable has no scope restriction (empty array)
 * - The variable explicitly opts into ALL_SCOPES
 * - Any of the variable's scopes is in the acceptable list
 */
export function scopesAccept(scopes: string[] | undefined, acceptable: string[]): boolean {
  if (!scopes || scopes.length === 0) return true;
  if (scopes.includes('ALL_SCOPES')) return true;
  return scopes.some((s) => acceptable.includes(s));
}

/**
 * Thrown when a name-based variable lookup found one or more name matches in the
 * library, but ALL of them were rejected because their Figma variable scopes are
 * incompatible with the binding role (e.g. `fill/primary` scoped to `FRAME_FILL`
 * being bound to a text node which needs `TEXT_FILL`).
 *
 * This is distinct from "variable not found" (no name match at all) — callers
 * should catch it and surface a descriptive error with the rejected candidates
 * so the agent can self-correct (e.g. "use text/primary instead").
 */
export class ScopeMismatchError extends Error {
  constructor(
    public readonly requestedName: string,
    public readonly requiredScopes: string[],
    public readonly rejected: Array<{ name: string; scopes: string[] }>,
  ) {
    super(
      `Variable "${requestedName}" matches library entries but their scopes exclude ` +
        `[${requiredScopes.join(', ')}]: ${rejected.map((r) => `"${r.name}" (scopes: [${r.scopes.join(', ')}])`).join(', ')}`,
    );
    this.name = 'ScopeMismatchError';
  }
}

/**
 * Thrown when a partial-name variable lookup matches multiple candidates and
 * scope filtering can't disambiguate them (either no scope hint was provided,
 * or several candidates satisfy the hint).
 *
 * Distinct from ScopeMismatchError: the candidates are semantically valid for
 * the binding context, they're just not uniquely identified by the given name.
 * Callers should surface the candidate list so the agent can re-request with a
 * fully qualified path (e.g. `"text/primary"` instead of `"primary"`).
 */
export class AmbiguousMatchError extends Error {
  constructor(
    public readonly requestedName: string,
    public readonly candidates: string[],
  ) {
    super(
      `Ambiguous variable "${requestedName}": ${candidates.length} matches found ` +
        `[${candidates
          .slice(0, 5)
          .map((n) => `"${n}"`)
          .join(', ')}]. Specify the full path (e.g. "collection/group/name") or use a variable ID.`,
    );
    this.name = 'AmbiguousMatchError';
  }
}

/** Cache for local COLOR variables with resolved values. */
let _colorVarCache: {
  vars: Array<{ variable: Variable; hex: string; scopes: string[] }>;
  ts: number;
} | null = null;
const COLOR_CACHE_TTL_MS = 30_000;

/**
 * Load local COLOR variables and resolve their default-mode hex values.
 * Cached with TTL to avoid repeated API calls.
 */
async function getLocalColorVarsResolved(): Promise<Array<{ variable: Variable; hex: string; scopes: string[] }>> {
  const now = Date.now();
  if (_colorVarCache && now - _colorVarCache.ts < COLOR_CACHE_TTL_MS) {
    return _colorVarCache.vars;
  }
  const [vars, collections] = await Promise.all([
    figma.variables.getLocalVariablesAsync('COLOR'),
    figma.variables.getLocalVariableCollectionsAsync(),
  ]);
  const defaultModes = new Map(collections.map((c) => [c.id, c.defaultModeId]));
  const result: Array<{ variable: Variable; hex: string; scopes: string[] }> = [];
  for (const v of vars) {
    const modeId = defaultModes.get(v.variableCollectionId);
    if (!modeId) continue;
    const val = v.valuesByMode[modeId];
    if (!val || typeof val !== 'object' || !('r' in val)) continue;
    const rgb = val as { r: number; g: number; b: number; a?: number };
    const r = Math.round(rgb.r * 255)
      .toString(16)
      .padStart(2, '0');
    const g = Math.round(rgb.g * 255)
      .toString(16)
      .padStart(2, '0');
    const b = Math.round(rgb.b * 255)
      .toString(16)
      .padStart(2, '0');
    const hex = `#${r}${g}${b}`.toUpperCase();
    const scopes: string[] = (v as any).scopes || [];
    result.push({ variable: v, hex, scopes });
  }
  _colorVarCache = { vars: result, ts: now };
  return result;
}

/**
 * Find a COLOR variable whose resolved value matches the given hex color,
 * filtered by Figma variable scope appropriate for the binding role.
 *
 * This is the scope-aware counterpart to paint-style suggestion.
 * When a hardcoded hex is specified and no Paint Style matches, this function
 * searches local COLOR variables by value + scope to find a semantic token.
 *
 * @param hex - The hex color to match (e.g. "#FF0000")
 * @param role - Binding context: 'background', 'textColor', or 'border'
 * @returns The matched variable or null
 */
export async function suggestColorVariable(hex: string, role: string, libraryName?: string): Promise<Variable | null> {
  const normalizedHex = hex.replace('#', '').toUpperCase();
  const targetHex = `#${normalizedHex.slice(0, 6)}`;
  const acceptableScopes = ROLE_TO_SCOPES[role];
  if (!acceptableScopes) return null;

  const colorVars = await getLocalColorVarsResolved();
  // First pass: exact hex match + scope match (local variables)
  for (const entry of colorVars) {
    if (entry.hex !== targetHex) continue;
    const hasScope =
      entry.scopes.length === 0 ||
      entry.scopes.includes('ALL_SCOPES') ||
      entry.scopes.some((s) => acceptableScopes.includes(s));
    if (hasScope) return entry.variable;
  }

  // Library fallback: check if the default variable for this role exists in the library
  if (libraryName) {
    try {
      const defaults = await resolveDefaults(libraryName);
      const defaultVar = defaults[role];
      if (defaultVar) {
        return cachedImportVariable(defaultVar.key, `suggestColor:${defaultVar.name}`);
      }
    } catch {
      /* best effort */
    }
  }

  return null;
}

/**
 * 3-level variable resolution strategy:
 *
 * Level 1: Exact name match (case-insensitive)
 * Level 2: "Collection/VarName" slash-path match — if name contains "/" and no exact match,
 *          try matching the last segment(s) against variable names within the named collection
 * Level 3: Scope-based disambiguation — when multiple variables share the same name segment,
 *          prefer the one whose scopes match the requested context
 *
 * @param vars - Array of variables to search
 * @param name - Variable name to resolve
 * @param preferredScopes - Optional scope hints for disambiguation (e.g. ['ALL_FILLS', 'FRAME_FILL'])
 * @returns The best-matched variable or null
 */
function resolveVariableByName(
  vars: Array<{ variable: Variable; scopes?: string[] }>,
  name: string,
  preferredScopes?: string[],
): Variable | null {
  const lower = name.toLowerCase();

  // When preferredScopes is provided, filter entries so scope-incompatible
  // variables are never returned (even via exact name match).
  const scopeOk = (entry: { variable: Variable; scopes?: string[] }): boolean => {
    if (!preferredScopes) return true;
    const scopes: string[] = entry.scopes ?? ((entry.variable as any).scopes as string[] | undefined) ?? [];
    return scopesAccept(scopes, preferredScopes);
  };

  // Level 1: exact case-insensitive match (scope-filtered)
  for (const entry of vars) {
    if (entry.variable.name.toLowerCase() === lower && scopeOk(entry)) return entry.variable;
  }

  // Level 2: slash-path match — "CollectionName/VarName" or partial path
  if (name.includes('/')) {
    const segments = lower.split('/');
    // Try matching by last N segments (progressively less specific)
    for (let drop = 1; drop < segments.length; drop++) {
      const suffix = segments.slice(drop).join('/');
      const candidates = vars.filter((e) => e.variable.name.toLowerCase().endsWith(suffix));
      // When preferredScopes provided, narrow to scope-accepted candidates first
      const pool = preferredScopes ? candidates.filter(scopeOk) : candidates;
      if (pool.length === 1) return pool[0].variable;
      if (pool.length > 1) {
        // Ambiguity even after scope filtering: throw AmbiguousMatchError so the
        // agent can surface the candidate list and self-correct with a full path.
        throw new AmbiguousMatchError(
          name,
          pool.map((e) => e.variable.name),
        );
      }
    }
  }

  // Level 2b: partial name match (no slash in input, but variable names have slashes)
  // e.g. input "primary" matches "colors/primary" or "text/primary"
  if (!name.includes('/')) {
    const candidates = vars.filter((e) => {
      const parts = e.variable.name.toLowerCase().split('/');
      return parts[parts.length - 1] === lower;
    });
    const pool = preferredScopes ? candidates.filter(scopeOk) : candidates;
    if (pool.length === 1) return pool[0].variable;
    if (pool.length > 1) {
      throw new AmbiguousMatchError(
        name,
        pool.map((e) => e.variable.name),
      );
    }
  }

  return null;
}

/**
 * Find a COLOR variable by name with library-first resolution:
 * In library mode (libraryName provided):
 *   1. Search library color collections by name, import via key (priority)
 *   2. Fallback to local variables with 3-level resolution
 * In no-library mode:
 *   1. Local variables with 3-level resolution (exact → slash-path → scope disambiguation)
 *
 * @param name - Variable name to search for (e.g. "colors/primary", "primary", "MyLib/colors/primary")
 * @param preferredScopes - Optional scope hints for disambiguation (local fallback only)
 * @param libraryName - Optional library name; when provided, library is searched first
 * @returns The matched variable or null
 */
export async function findColorVariableByName(
  name: string,
  preferredScopes?: string[],
  libraryName?: string,
): Promise<Variable | null> {
  // In library mode, search library first — library tokens take priority over local variables.
  // This avoids the case where a local variable with the same name shadows the intended library token.
  if (libraryName) {
    try {
      const variable = await findLibraryVariableByName(name, 'COLOR', libraryName, preferredScopes);
      if (variable) return variable;
    } catch (err) {
      // ScopeMismatchError / AmbiguousMatchError are semantic signals that the name was
      // recognized but can't be bound unambiguously. Let them propagate so callers
      // (applyFill, applyStroke) can emit descriptive hints instead of falling back to
      // local lookup and reporting "not found".
      if (err instanceof ScopeMismatchError || err instanceof AmbiguousMatchError) throw err;
      /* other library lookup failure — fall through to local */
    }
  }

  // Fallback: search local variables
  const colorVars = await getLocalColorVarsResolved();
  const entries = colorVars.map((e) => ({ variable: e.variable, scopes: e.scopes }));
  return resolveVariableByName(entries, name, preferredScopes);
}

/**
 * Search library variable collections for a variable by name and import it.
 *
 * This is the library fallback for findColorVariableByName / findFloatVariableByName.
 * When a variable name (e.g. "text/primary") exists in the team library but hasn't
 * been used in the current file yet, getLocalVariablesAsync won't find it.
 * This function searches the library's collections, finds the matching key,
 * and imports the variable via cachedImportVariable.
 *
 * When `preferredScopes` is provided and resolvedType is 'COLOR', candidates are
 * imported and filtered by Variable.scopes. A variable whose scopes don't accept
 * the target context (e.g. `fill/primary` with `['ALL_FILLS','FRAME_FILL']` bound
 * against a text node's `['ALL_FILLS','TEXT_FILL']`) is rejected and the search
 * continues instead of returning a semantically wrong match.
 *
 * @param name - Variable name to search for
 * @param resolvedType - 'COLOR' or 'FLOAT' to filter collections
 * @param libraryName - The library to search in
 * @param preferredScopes - Optional scope hints for scope-aware filtering (COLOR only)
 * @returns The imported Variable or null
 */
async function findLibraryVariableByName(
  name: string,
  resolvedType: 'COLOR' | 'FLOAT',
  libraryName: string,
  preferredScopes?: string[],
): Promise<Variable | null> {
  const collections = await getCollectionIndex(libraryName);
  if (collections.length === 0) return null;

  const lower = name.toLowerCase();
  // Only apply scope filtering for COLOR — FLOAT scopes are orthogonal (GAP, RADIUS, etc.)
  // and the current scope hint tables are color-only.
  const applyScopeFilter = resolvedType === 'COLOR' && preferredScopes && preferredScopes.length > 0;

  // Track variables that matched by name but failed scope filtering, so we can
  // throw a descriptive ScopeMismatchError at the end if nothing else matched.
  // This distinguishes "not found" from "found but wrong scope" in caller-visible errors.
  const scopeRejected: Array<{ name: string; scopes: string[] }> = [];
  // Track partial-name candidates that survived scope filtering but left 2+ hits —
  // AmbiguousMatchError at the end lets the agent re-request with a full path.
  const ambiguousCandidates: string[] = [];

  // Import a candidate and check its scopes against preferredScopes.
  // Returns the imported Variable if accepted, or null if the scope doesn't match.
  // Records rejections into scopeRejected so we can surface them upstream.
  const importIfScopeAccepted = async (dv: DesignVariable): Promise<Variable | null> => {
    const imported = await cachedImportVariable(dv.key, `library:${dv.name}`);
    if (!applyScopeFilter) return imported;
    const scopes = ((imported as any).scopes as string[] | undefined) ?? [];
    if (scopesAccept(scopes, preferredScopes!)) return imported;
    scopeRejected.push({ name: dv.name, scopes });
    return null;
  };

  // Filter collections by type heuristic:
  // COLOR → collections with "color", "semantic", "theme" in name
  // FLOAT → collections with "spacing", "size", "radius", "layout", "rounded" in name
  // If no heuristic match, search all collections
  const typeHints =
    resolvedType === 'COLOR'
      ? ['color', 'semantic', 'theme']
      : ['spacing', 'size', 'radius', 'layout', 'rounded', 'typography'];
  let targetCols = collections.filter((c) => {
    const n = c.name.toLowerCase();
    return typeHints.some((h) => n.includes(h));
  });
  // Fallback: search all collections if no heuristic match
  if (targetCols.length === 0) targetCols = collections;

  // Search each collection for a matching variable name
  for (const col of targetCols) {
    const vars = await getCollectionVariables(col.key);
    const filtered = vars.filter((v) => v.resolvedType === resolvedType);

    // Level 1: exact name match (case-insensitive)
    const exact = filtered.find((v) => v.name.toLowerCase() === lower);
    if (exact) {
      const accepted = await importIfScopeAccepted(exact);
      if (accepted) return accepted;
      // Scope-mismatched exact match: fall through and keep searching other collections.
    }

    // Level 2: partial path match (input "primary" matches "text/primary")
    if (!name.includes('/')) {
      const partial = filtered.filter((v) => {
        const parts = v.name.toLowerCase().split('/');
        return parts[parts.length - 1] === lower;
      });
      if (partial.length === 0) continue;

      if (!applyScopeFilter) {
        // Original behavior: only return when there's exactly one candidate.
        if (partial.length === 1) {
          return cachedImportVariable(partial[0].key, `library:${partial[0].name}`);
        }
        // 2+ candidates without scope disambiguation: record for end-of-function throw.
        for (const p of partial) ambiguousCandidates.push(p.name);
        continue;
      }

      // Scope-aware mode: import all candidates in parallel, keep only scope-accepted ones.
      const imported = await Promise.all(
        partial.map((v) =>
          cachedImportVariable(v.key, `library:${v.name}`).then(
            (imp) => ({ imp, src: v }),
            () => null,
          ),
        ),
      );
      const accepted: Array<{ imp: Variable; src: DesignVariable }> = [];
      for (const r of imported) {
        if (r === null) continue;
        const scopes = ((r.imp as any).scopes as string[] | undefined) ?? [];
        if (scopesAccept(scopes, preferredScopes!)) {
          accepted.push(r);
        } else {
          scopeRejected.push({ name: r.src.name, scopes });
        }
      }
      if (accepted.length === 1) return accepted[0].imp;
      if (accepted.length >= 2) {
        // Multiple candidates survived scope filtering — ambiguous, record all so the
        // final throw below surfaces the complete list across collections.
        for (const a of accepted) ambiguousCandidates.push(a.src.name);
      }
      // 0 accepted → fall through to next collection.
    }
  }

  // Nothing was returned. Priority:
  //   1. Scope mismatch (name matched but all scopes rejected) — ScopeMismatchError
  //   2. Ambiguous partial match (2+ candidates across collections) — AmbiguousMatchError
  //   3. No name match at all — return null, caller falls through to local lookup
  if (applyScopeFilter && scopeRejected.length > 0) {
    throw new ScopeMismatchError(name, preferredScopes!, scopeRejected);
  }
  if (ambiguousCandidates.length > 1) {
    // Dedup in case the same name appeared in multiple collections
    const unique = Array.from(new Set(ambiguousCandidates));
    if (unique.length > 1) throw new AmbiguousMatchError(name, unique);
  }
  return null;
}

/**
 * Find a FLOAT variable by name with library-first resolution:
 * In library mode (libraryName provided):
 *   1. Search library collections by name, import via key (priority)
 *   2. Fallback to local variables with 3-level resolution
 * In no-library mode:
 *   1. Local variables with 3-level resolution (exact → slash-path → scope disambiguation)
 *
 * @param name - Variable name to search for (e.g. "spacing/md", "radius/lg", "md")
 * @param preferredScopes - Optional scope hints for disambiguation (local fallback only)
 * @param libraryName - Optional library name; when provided, library is searched first
 * @returns The matched variable or null
 */
export async function findFloatVariableByName(
  name: string,
  preferredScopes?: string[],
  libraryName?: string,
): Promise<Variable | null> {
  // In library mode, search library first
  if (libraryName) {
    try {
      // FLOAT scope filtering is a no-op inside findLibraryVariableByName today
      // (the role hint tables are color-only); pass through for signature consistency.
      const variable = await findLibraryVariableByName(name, 'FLOAT', libraryName, preferredScopes);
      if (variable) return variable;
    } catch {
      /* library lookup failed — fall through to local */
    }
  }

  // Fallback: search local variables
  const vars = await figma.variables.getLocalVariablesAsync('FLOAT');
  const entries = vars.map((v) => ({ variable: v, scopes: (v as any).scopes as string[] | undefined }));
  return resolveVariableByName(entries, name, preferredScopes);
}

/**
 * Find a COLOR variable by Figma variable ID (direct binding).
 * Used when the agent specifies `{ _variableId: "VariableID:123:456" }`.
 *
 * @param id - Figma variable ID
 * @returns The variable or null
 */
export async function findColorVariableById(id: string): Promise<Variable | null> {
  try {
    const variable = await figma.variables.getVariableByIdAsync(id);
    if (!variable) return null;
    // Only return COLOR variables — binding a FLOAT to a paint fill would fail at runtime
    if (variable.resolvedType !== 'COLOR') return null;
    return variable;
  } catch {
    return null;
  }
}

/**
 * Auto-bind typography variables to a text node.
 * Matches fontSize to the closest typography scale, then binds all properties.
 * Returns the matched scale name or null.
 */
export interface TypographyBindResult {
  scale: string;
  exact: boolean;
  requestedSize: number;
  matchedSize: number;
  hint?: string;
}

export async function autoBindTypography(
  node: TextNode,
  fontSize: number,
  libraryName: string,
  options?: { skipFontFamily?: boolean },
): Promise<TypographyBindResult | null> {
  if (libraryName === LOCAL_LIBRARY) return null;

  return withTimeout(
    _autoBindTypographyImpl(node, fontSize, libraryName, options),
    AUTO_BIND_TIMEOUT_MS,
    null,
    `autoBindTypography(${fontSize})`,
  );
}

async function _autoBindTypographyImpl(
  node: TextNode,
  fontSize: number,
  libraryName: string,
  options?: { skipFontFamily?: boolean },
): Promise<TypographyBindResult | null> {
  try {
    const map = await getTypographyMapping(libraryName);
    if (map.size === 0) return null;

    // Find exact match first
    let binding = map.get(fontSize);
    let matchedSize = fontSize;
    let exact = true;

    // No exact match → find closest scale, but only bind if within threshold
    if (!binding) {
      exact = false;
      let minDiff = Infinity;
      for (const [size, b] of map) {
        const diff = Math.abs(size - fontSize);
        if (diff < minDiff) {
          minDiff = diff;
          binding = b;
          matchedSize = size;
        }
      }
      // If closest match is more than 2px away, don't auto-bind — just return hint
      if (binding && minDiff > 2) {
        const availableSizes = [...map.entries()].sort(([a], [b]) => b - a).map(([size, b]) => `${b.scale}(${size}px)`);
        return {
          scale: binding.scale,
          exact: false,
          requestedSize: fontSize,
          matchedSize,
          hint: `fontSize ${fontSize}px is ${minDiff}px away from nearest scale ${binding.scale}(${matchedSize}px) — skipped auto-bind (threshold: 2px). Available: ${availableSizes.join(', ')}`,
        };
      }
    }
    if (!binding) return null;

    // Import all typography variables in parallel to avoid serial network round-trips.
    // Previously: 4 sequential imports × 100-2000ms = 0.4-8s
    // Now: all in parallel = max(100-2000ms) ≈ 0.1-2s
    const importTasks: Array<{ field: string; key: string; label: string }> = [
      { field: 'fontSize', key: binding.fontSize.key, label: binding.fontSize.name },
    ];
    if (!options?.skipFontFamily) {
      if (binding.fontFamily) {
        importTasks.push({ field: 'fontFamily', key: binding.fontFamily.key, label: binding.fontFamily.name });
      }
      if (binding.fontWeight) {
        importTasks.push({ field: 'fontWeight', key: binding.fontWeight.key, label: binding.fontWeight.name });
      }
    }
    if (binding.lineHeight) {
      importTasks.push({ field: 'lineHeight', key: binding.lineHeight.key, label: binding.lineHeight.name });
    }

    const importResults = await Promise.allSettled(
      importTasks.map((t) =>
        cachedImportVariable(t.key, `importVariable(${t.field}:${t.label})`).then((imported) => ({
          field: t.field,
          imported,
        })),
      ),
    );

    // fontSize is required — if it failed, abort
    const fsResult = importResults[0];
    if (fsResult.status !== 'fulfilled') {
      throw fsResult.reason;
    }
    (node as SceneNode).setBoundVariable('fontSize' as VariableBindableNodeField, fsResult.value.imported);

    // Bind remaining fields (best-effort)
    const fieldToBindable: Record<string, string> = {
      fontFamily: 'fontFamily',
      fontWeight: 'fontStyle', // Figma maps fontWeight to fontStyle bindable field
      lineHeight: 'lineHeight',
    };
    for (let i = 1; i < importResults.length; i++) {
      const r = importResults[i];
      if (r.status === 'fulfilled') {
        const bindField = fieldToBindable[r.value.field];
        if (bindField) {
          try {
            (node as SceneNode).setBoundVariable(bindField as VariableBindableNodeField, r.value.imported);
          } catch {
            /* skip — binding may not be supported for this field */
          }
        }
      }
    }

    // Build hint for non-exact matches
    const availableSizes = [...map.entries()].sort(([a], [b]) => b - a).map(([size, b]) => `${b.scale}(${size}px)`);
    const hint = exact
      ? undefined
      : `fontSize ${fontSize}px not in typography scale, matched closest: ${binding.scale}(${matchedSize}px). Available: ${availableSizes.join(', ')}`;

    return { scale: binding.scale, exact, requestedSize: fontSize, matchedSize, hint };
  } catch (err) {
    console.warn('[figcraft] autoBindTypography failed:', fontSize, err);
    return null;
  }
}
