/**
 * Design context — lazy per-collection caching, typography matching, auto-binding.
 *
 * Architecture:
 * - get_mode returns lightweight collection index + defaults (no variable lists)
 * - Variables loaded per-collection on first use
 * - Typography mapping built on first create_text (imports font-size vars to read values)
 */

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
const DEFAULT_MAPPINGS: Record<string, string[]> = {
  textColor: ['text/primary', 'text/default', 'color/text/primary'],
  headingColor: ['text/emphasis', 'text/heading', 'color/text/emphasis'],
  background: ['surface/primary', 'surface/default', 'background/primary'],
  border: ['border/default', 'border/primary'],
};

// ─── Collection index (lightweight) ───

async function getCollectionIndex(libraryName: string): Promise<CollectionInfo[]> {
  if (indexCache && indexCache.library === libraryName) {
    return indexCache.collections;
  }
  const all = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
  const collections = all
    .filter((c) => c.libraryName === libraryName)
    .map((c) => ({ key: c.key, name: c.name, libraryName: c.libraryName }));
  indexCache = { library: libraryName, collections };
  return collections;
}

// ─── Per-collection variable loading (lazy) ───

async function getCollectionVariables(collectionKey: string): Promise<DesignVariable[]> {
  if (collectionVarCache.has(collectionKey)) {
    return collectionVarCache.get(collectionKey)!;
  }
  const vars = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(collectionKey);
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
  // Only load color-related collections for defaults
  const colorCol = collections.find((c) => c.name === 'color');

  let allColorVars: DesignVariable[] = [];
  if (colorCol) {
    allColorVars = await getCollectionVariables(colorCol.key);
  }

  const nameMap = new Map(allColorVars.map((v) => [v.name, v]));
  const defaults: Record<string, DesignVariable | null> = {};

  for (const [role, candidates] of Object.entries(DEFAULT_MAPPINGS)) {
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

  // Import all font-size variables in parallel
  const importResults = await Promise.allSettled(
    scaleEntries.map(async (e) => {
      const imported = await figma.variables.importVariableByKeyAsync(e.fsVar.key);
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
 * Only loads collection index (1 API call), no variable lists.
 */
export async function getLibraryDesignContext(
  libraryName: string,
): Promise<DesignContextResult> {
  const collections = await getCollectionIndex(libraryName);
  const defaults = await resolveDefaults(libraryName);

  // Extract typography scales from collection if available
  const typoCol = collections.find(
    (c) => c.name.includes('typography') && !c.name.includes('primitives'),
  );
  let typographyScales: string[] = [];
  if (typoCol) {
    const vars = await getCollectionVariables(typoCol.key);
    typographyScales = extractTypographyScales(vars);
  }

  return {
    source: 'library',
    libraryName,
    collections: collections.map((c) => ({ name: c.name, key: c.key })),
    defaults,
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
  for (const [role, candidates] of Object.entries(DEFAULT_MAPPINGS)) {
    defaults[role] = null;
    for (const name of candidates) {
      if (nameMap.has(name)) { defaults[role] = nameMap.get(name)!; break; }
    }
  }

  return {
    source: 'local',
    libraryName: null,
    collections,
    defaults,
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
}

/**
 * Auto-bind a default color variable to a node's fills.
 */
export async function autoBindDefault(
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
      : await figma.variables.importVariableByKeyAsync(defaultVar.key);

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

  try {
    const map = await getTypographyMapping(libraryName);
    if (map.size === 0) return null;

    // Find exact match first
    let binding = map.get(fontSize);
    let matchedSize = fontSize;
    let exact = true;

    // No exact match → find closest scale
    if (!binding) {
      exact = false;
      let minDiff = Infinity;
      for (const [size, b] of map) {
        const diff = Math.abs(size - fontSize);
        if (diff < minDiff) { minDiff = diff; binding = b; matchedSize = size; }
      }
    }
    if (!binding) return null;

    // Bind fontSize
    const fsImported = await figma.variables.importVariableByKeyAsync(binding.fontSize.key);
    (node as SceneNode).setBoundVariable('fontSize' as VariableBindableNodeField, fsImported);

    // Bind fontFamily + fontWeight — only when user didn't explicitly specify a font
    if (!options?.skipFontFamily) {
      if (binding.fontFamily) {
        const ffImported = await figma.variables.importVariableByKeyAsync(binding.fontFamily.key);
        (node as SceneNode).setBoundVariable('fontFamily' as VariableBindableNodeField, ffImported);
      }
      if (binding.fontWeight) {
        try {
          const fwImported = await figma.variables.importVariableByKeyAsync(binding.fontWeight.key);
          (node as SceneNode).setBoundVariable('fontStyle' as VariableBindableNodeField, fwImported);
        } catch { /* fontWeight binding may not be supported */ }
      }
    }

    // Bind lineHeight
    if (binding.lineHeight) {
      const lhImported = await figma.variables.importVariableByKeyAsync(binding.lineHeight.key);
      (node as SceneNode).setBoundVariable('lineHeight' as VariableBindableNodeField, lhImported);
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
