/**
 * Design context — lazy per-collection caching, typography matching, auto-binding.
 *
 * Architecture:
 * - get_mode returns lightweight collection index + defaults (no variable lists)
 * - Variables loaded per-collection on first use
 * - Typography mapping built on first text creation (imports font-size vars to read values)
 */

import { STORAGE_KEYS } from '../constants.js';
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
  typographyScales: string[];
  registeredStyles?: {
    textStyles: Array<{ name: string; fontSize: number; fontFamily: string }>;
    paintStyles: Array<{ name: string; hex: string }>;
    effectStyles: Array<{ name: string; effectType: string }>;
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
  textColor: ['text/primary', 'text/default', 'color/text/primary', 'colors/text-primary'],
  headingColor: ['text/emphasis', 'text/heading', 'color/text/emphasis', 'colors/text-emphasis'],
  background: ['surface/primary', 'surface/default', 'background/primary', 'colors/surface-primary'],
  border: ['border/default', 'border/primary', 'colors/border-default'],
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
    const stored = await figma.clientStorage.getAsync(`${STORAGE_KEYS.ROLE_MAPPINGS_PREFIX}${libraryName}`) as string | undefined;
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
  } catch { /* ignore parse errors */ }
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
  if (displayName === '__local__') return displayName;
  try {
    const entriesRaw = await figma.clientStorage.getAsync(STORAGE_KEYS.LIBRARY_URLS) as
      Record<string, { name: string; variableLibraryName?: string }> | null;
    if (entriesRaw && typeof entriesRaw === 'object') {
      for (const entry of Object.values(entriesRaw)) {
        if (entry && entry.name === displayName && entry.variableLibraryName) {
          return entry.variableLibraryName;
        }
      }
    }
  } catch { /* ignore storage errors */ }
  return displayName;
}

// ─── Collection index (lightweight) ───

async function getCollectionIndex(libraryName: string): Promise<CollectionInfo[]> {
  if (indexCache && indexCache.library === libraryName) {
    return indexCache.collections;
  }
  // Resolve the actual variable API name (may differ from display name)
  const resolvedName = await resolveVariableLibraryName(libraryName);

  const all = await withTimeout(
    figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync(),
    API_CALL_TIMEOUT_MS,
    [],
    'getAvailableLibraryVariableCollections',
  );
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
  const typoCol = collections.find(
    (c) => c.name.includes('typography') && !c.name.includes('primitives'),
  );
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
        const collection = await figma.variables.getVariableCollectionByIdAsync(
          r.value.imported.variableCollectionId,
        );
        if (collection) {
          resolvedModeId = collection.modes[0].modeId;
          break;
        }
      } catch { /* try next */ }
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
export async function getLibraryDesignContext(
  libraryName: string,
): Promise<DesignContextResult> {
  const collections = await getCollectionIndex(libraryName);

  // Run defaults and typography loading in parallel to avoid sequential 8s+8s+8s
  const typoCol = collections.find(
    (c) => c.name.includes('typography') && !c.name.includes('primitives'),
  );

  const [defaults, typographyScales] = await Promise.all([
    resolveDefaults(libraryName),
    typoCol
      ? getCollectionVariables(typoCol.key).then(extractTypographyScales).catch(() => [] as string[])
      : Promise.resolve([] as string[]),
    // Preheat typography mapping in parallel — avoids cold-start latency on first text creation
    typoCol ? getTypographyMapping(libraryName).catch(() => {}) : Promise.resolve(),
  ]);

  // Compute unresolved defaults for agent awareness
  const unresolvedDefaults = Object.entries(defaults)
    .filter(([, v]) => v === null)
    .map(([role]) => role);

  return {
    source: 'library',
    libraryName,
    collections: collections.map((c) => ({ name: c.name, key: c.key })),
    defaults,
    ...(unresolvedDefaults.length > 0 ? { unresolvedDefaults } : undefined),
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
  const varResults = await Promise.allSettled(
    allVarIds.map((varId) => figma.variables.getVariableByIdAsync(varId)),
  );
  const allVars: DesignVariable[] = [];
  for (const r of varResults) {
    if (r.status === 'fulfilled' && r.value) {
      allVars.push({ name: r.value.name, key: r.value.key, resolvedType: r.value.resolvedType });
    }
  }
  const nameMap = new Map(allVars.map((v) => [v.name, v]));
  const defaults: Record<string, DesignVariable | null> = {};
  const mappings = await getEffectiveMappings('__local__');
  for (const [role, candidates] of Object.entries(mappings)) {
    defaults[role] = null;
    for (const name of candidates) {
      if (nameMap.has(name)) { defaults[role] = nameMap.get(name)!; break; }
    }
  }

  // Compute unresolved defaults for agent awareness
  const unresolvedDefaults = Object.entries(defaults)
    .filter(([, v]) => v === null)
    .map(([role]) => role);

  return {
    source: 'local',
    libraryName: null,
    collections,
    defaults,
    ...(unresolvedDefaults.length > 0 ? { unresolvedDefaults } : undefined),
    typographyScales: [],
  };
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

async function _autoBindDefaultImpl(
  node: SceneNode & MinimalFillsMixin,
  role: string,
  libraryName: string,
): Promise<string | null> {
  try {
    const defaults = libraryName === '__local__'
      ? (await getLocalDesignContext()).defaults
      : await resolveDefaults(libraryName);

    const defaultVar = defaults[role];
    if (!defaultVar) return null;

    const variable = libraryName === '__local__'
      ? await figma.variables.getVariableByIdAsync(defaultVar.key)
      : await cachedImportVariable(defaultVar.key, `importVariable(${defaultVar.name})`);

    if (!variable) return null;

    const fills = [...node.fills as Paint[]];
    if (fills[0]) {
      fills[0] = figma.variables.setBoundVariableForPaint(
        fills[0] as SolidPaint, 'color', variable,
      );
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
    const defaults = libraryName === '__local__'
      ? (await getLocalDesignContext()).defaults
      : await resolveDefaults(libraryName);

    const defaultVar = defaults[role];
    if (!defaultVar) return null;

    const variable = libraryName === '__local__'
      ? await figma.variables.getVariableByIdAsync(defaultVar.key)
      : await cachedImportVariable(defaultVar.key, `importVariable(${defaultVar.name})`);

    if (!variable) return null;

    const strokes = [...node.strokes as Paint[]];
    if (strokes.length > 0 && strokes[0]) {
      strokes[0] = figma.variables.setBoundVariableForPaint(
        strokes[0] as SolidPaint, 'color', variable,
      );
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
    const r = Math.round(rgb.r * 255).toString(16).padStart(2, '0');
    const g = Math.round(rgb.g * 255).toString(16).padStart(2, '0');
    const b = Math.round(rgb.b * 255).toString(16).padStart(2, '0');
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
export async function suggestColorVariable(
  hex: string,
  role: string,
): Promise<Variable | null> {
  const normalizedHex = hex.replace('#', '').toUpperCase();
  const targetHex = `#${normalizedHex.slice(0, 6)}`;
  const acceptableScopes = ROLE_TO_SCOPES[role];
  if (!acceptableScopes) return null;

  const colorVars = await getLocalColorVarsResolved();
  // First pass: exact hex match + scope match
  for (const entry of colorVars) {
    if (entry.hex !== targetHex) continue;
    // Check scope: variable must have at least one acceptable scope, or ALL_SCOPES
    const hasScope = entry.scopes.length === 0 // no scopes = unrestricted
      || entry.scopes.includes('ALL_SCOPES')
      || entry.scopes.some((s) => acceptableScopes.includes(s));
    if (hasScope) return entry.variable;
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

  // Level 1: exact case-insensitive match
  for (const entry of vars) {
    if (entry.variable.name.toLowerCase() === lower) return entry.variable;
  }

  // Level 2: slash-path match — "CollectionName/VarName" or partial path
  if (name.includes('/')) {
    const segments = lower.split('/');
    // Try matching by last N segments (progressively less specific)
    for (let drop = 1; drop < segments.length; drop++) {
      const suffix = segments.slice(drop).join('/');
      const candidates = vars.filter((e) => e.variable.name.toLowerCase().endsWith(suffix));
      if (candidates.length === 1) return candidates[0].variable;
      if (candidates.length > 1 && preferredScopes) {
        // Level 3: scope disambiguation among candidates
        const scopeMatch = candidates.find((e) => {
          const scopes: string[] = e.scopes ?? (e.variable as any).scopes ?? [];
          return scopes.length === 0 || scopes.includes('ALL_SCOPES')
            || scopes.some((s) => preferredScopes.includes(s));
        });
        if (scopeMatch) return scopeMatch.variable;
      }
      if (candidates.length > 1) {
        // Ambiguity: throw error listing candidates so the agent can self-correct
        const names = candidates.slice(0, 5).map((e) => `"${e.variable.name}"`).join(', ');
        throw new Error(
          `Ambiguous variable "${name}": ${candidates.length} matches found [${names}]. ` +
          `Specify the full path (e.g. "collection/group/name") or use a variable ID.`,
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
    if (candidates.length === 1) return candidates[0].variable;
    if (candidates.length > 1 && preferredScopes) {
      // Level 3: scope disambiguation
      const scopeMatch = candidates.find((e) => {
        const scopes: string[] = e.scopes ?? (e.variable as any).scopes ?? [];
        return scopes.length === 0 || scopes.includes('ALL_SCOPES')
          || scopes.some((s) => preferredScopes.includes(s));
      });
      if (scopeMatch) return scopeMatch.variable;
    }
    if (candidates.length > 1) {
      // Ambiguity: throw error listing candidates so the agent can self-correct
      const names = candidates.slice(0, 5).map((e) => `"${e.variable.name}"`).join(', ');
      throw new Error(
        `Ambiguous variable "${name}": ${candidates.length} matches found [${names}]. ` +
        `Specify the full path (e.g. "collection/group/name") or use a variable ID.`,
      );
    }
  }

  return null;
}

/**
 * Find a COLOR variable by name with 3-level resolution:
 * 1. Exact case-insensitive match
 * 2. Slash-path / partial name match
 * 3. Scope-based disambiguation
 *
 * @param name - Variable name to search for (e.g. "colors/primary", "primary", "MyLib/colors/primary")
 * @param preferredScopes - Optional scope hints for disambiguation
 * @returns The matched variable or null
 */
export async function findColorVariableByName(name: string, preferredScopes?: string[]): Promise<Variable | null> {
  const colorVars = await getLocalColorVarsResolved();
  const entries = colorVars.map((e) => ({ variable: e.variable, scopes: e.scopes }));
  return resolveVariableByName(entries, name, preferredScopes);
}

/**
 * Find a FLOAT variable by name with 3-level resolution:
 * 1. Exact case-insensitive match
 * 2. Slash-path / partial name match
 * 3. Scope-based disambiguation
 *
 * @param name - Variable name to search for (e.g. "spacing/md", "radius/lg", "md")
 * @param preferredScopes - Optional scope hints for disambiguation
 * @returns The matched variable or null
 */
export async function findFloatVariableByName(name: string, preferredScopes?: string[]): Promise<Variable | null> {
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
  if (libraryName === '__local__') return null;

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
        if (diff < minDiff) { minDiff = diff; binding = b; matchedSize = size; }
      }
      // If closest match is more than 2px away, don't auto-bind — just return hint
      if (binding && minDiff > 2) {
        const availableSizes = [...map.entries()]
          .sort(([a], [b]) => b - a)
          .map(([size, b]) => `${b.scale}(${size}px)`);
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
        cachedImportVariable(t.key, `importVariable(${t.field}:${t.label})`)
          .then((imported) => ({ field: t.field, imported })),
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
      fontWeight: 'fontStyle',  // Figma maps fontWeight to fontStyle bindable field
      lineHeight: 'lineHeight',
    };
    for (let i = 1; i < importResults.length; i++) {
      const r = importResults[i];
      if (r.status === 'fulfilled') {
        const bindField = fieldToBindable[r.value.field];
        if (bindField) {
          try {
            (node as SceneNode).setBoundVariable(bindField as VariableBindableNodeField, r.value.imported);
          } catch { /* skip — binding may not be supported for this field */ }
        }
      }
    }

    // Build hint for non-exact matches
    const availableSizes = [...map.entries()]
      .sort(([a], [b]) => b - a)
      .map(([size, b]) => `${b.scale}(${size}px)`);
    const hint = exact ? undefined
      : `fontSize ${fontSize}px not in typography scale, matched closest: ${binding.scale}(${matchedSize}px). Available: ${availableSizes.join(', ')}`;

    return { scale: binding.scale, exact, requestedSize: fontSize, matchedSize, hint };
  } catch (err) {
    console.warn('[figcraft] autoBindTypography failed:', fontSize, err);
    return null;
  }
}
