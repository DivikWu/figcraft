/**
 * Style registry — register, persist, and match library styles for auto-application.
 *
 * No scanning. AI registers styles via register_library_styles (data from official Figma MCP).
 * Styles are imported via importStyleByKeyAsync and mapped in memory for O(1) lookup.
 * Keys persisted in clientStorage for lazy recovery after plugin restart.
 */

// ─── Types ───

export interface RegisteredTextStyle {
  key: string;
  name: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
}

export interface RegisteredPaintStyle {
  key: string;
  name: string;
  hex: string;
}

export interface RegisteredEffectStyle {
  key: string;
  name: string;
  effectType: string;
}

export interface RegisteredStyles {
  textStyles: RegisteredTextStyle[];
  paintStyles: RegisteredPaintStyle[];
  effectStyles: RegisteredEffectStyle[];
}

// ─── In-memory maps (built on register/restore, queried on create) ───

const textStyleMap = new Map<number, { id: string; name: string }>();
const paintStyleMap = new Map<string, { id: string; name: string }>();
const effectStyleMap = new Map<string, { id: string; name: string }>();
let loadedLibrary: string | null = null;

function storageKey(library: string): string {
  return `figcraft_styles_${library}`;
}

/** Import a style by key with a timeout to avoid hanging on deleted keys. */
function importWithTimeout(key: string, timeoutMs = 5000): Promise<{ id: string }> {
  return Promise.race([
    figma.importStyleByKeyAsync(key),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Import timeout: ${key}`)), timeoutMs),
    ),
  ]);
}

// ─── Register (one-time, AI-driven) ───

export async function registerStyles(
  library: string,
  styles: RegisteredStyles,
): Promise<{ textStyles: number; paintStyles: number; effectStyles: number }> {
  // Clear previous maps
  textStyleMap.clear();
  paintStyleMap.clear();
  effectStyleMap.clear();

  // Import all styles in parallel for speed
  const [textResults, paintResults, effectResults] = await Promise.all([
    Promise.allSettled(
      styles.textStyles.map(async (ts) => {
        const imported = await importWithTimeout(ts.key);
        return { fontSize: ts.fontSize, id: imported.id, name: ts.name };
      }),
    ),
    Promise.allSettled(
      styles.paintStyles.map(async (ps) => {
        const imported = await importWithTimeout(ps.key);
        return { hex: ps.hex.toLowerCase(), id: imported.id, name: ps.name };
      }),
    ),
    Promise.allSettled(
      styles.effectStyles.map(async (es) => {
        const imported = await importWithTimeout(es.key);
        return { effectType: es.effectType, id: imported.id, name: es.name };
      }),
    ),
  ]);

  for (const r of textResults) {
    if (r.status === 'fulfilled') textStyleMap.set(r.value.fontSize, { id: r.value.id, name: r.value.name });
  }
  for (const r of paintResults) {
    if (r.status === 'fulfilled') paintStyleMap.set(r.value.hex, { id: r.value.id, name: r.value.name });
  }
  for (const r of effectResults) {
    if (r.status === 'fulfilled') effectStyleMap.set(r.value.effectType, { id: r.value.id, name: r.value.name });
  }

  // Persist to clientStorage
  await figma.clientStorage.setAsync(storageKey(library), JSON.stringify(styles));
  loadedLibrary = library;

  return {
    textStyles: textStyleMap.size,
    paintStyles: paintStyleMap.size,
    effectStyles: effectStyleMap.size,
  };
}

// ─── Lazy restore (after plugin restart) ───

export async function ensureLoaded(library: string): Promise<void> {
  if (loadedLibrary === library) return;

  const json = await figma.clientStorage.getAsync(storageKey(library)) as string | undefined;
  if (!json) {
    loadedLibrary = library;
    return;
  }

  try {
    const styles = JSON.parse(json) as RegisteredStyles;
    await registerStyles(library, styles);
  } catch {
    loadedLibrary = library;
  }
}

// ─── Query (pure memory, 0ms) ───

export function getTextStyleId(fontSize: number): { id: string; name: string } | null {
  return textStyleMap.get(fontSize) ?? null;
}

export function getPaintStyleId(hex: string): { id: string; name: string } | null {
  return paintStyleMap.get(hex.toLowerCase()) ?? null;
}

export function getEffectStyleId(effectType: string): { id: string; name: string } | null {
  return effectStyleMap.get(effectType) ?? null;
}

// ─── Get registered styles summary (for get_mode response) ───

export async function getRegisteredStylesSummary(
  library: string,
): Promise<(RegisteredStyles & { _loaded?: { text: number; paint: number; effect: number } }) | null> {
  // Read from storage (source of truth for full registered list)
  const json = await figma.clientStorage.getAsync(storageKey(library)) as string | undefined;
  if (!json) return null;
  try {
    const styles = JSON.parse(json) as RegisteredStyles;
    // Include actual in-memory counts so AI can detect import failures
    if (loadedLibrary === library) {
      (styles as any)._loaded = {
        text: textStyleMap.size,
        paint: paintStyleMap.size,
        effect: effectStyleMap.size,
      };
    }
    return styles;
  } catch {
    return null;
  }
}

// ─── Incremental register (only import changed styles, preserve unchanged) ───

export async function registerStylesIncremental(
  library: string,
  fullStyles: RegisteredStyles,
  changedStyles: RegisteredStyles,
  removedKeys: string[],
): Promise<{ textStyles: number; paintStyles: number; effectStyles: number }> {
  // Ensure current maps are loaded
  await ensureLoaded(library);

  // Remove deleted styles from maps.
  // In-memory maps are keyed by value (fontSize/hex/effectType), not by style key,
  // so we look up stored data to find which value keys to delete.
  if (removedKeys.length > 0) {
    const removedSet = new Set(removedKeys);
    const storedJson = await figma.clientStorage.getAsync(storageKey(library)) as string | undefined;
    if (storedJson) {
      const stored = JSON.parse(storedJson) as RegisteredStyles;
      for (const ts of stored.textStyles) {
        if (removedSet.has(ts.key)) textStyleMap.delete(ts.fontSize);
      }
      for (const ps of stored.paintStyles) {
        if (removedSet.has(ps.key)) paintStyleMap.delete(ps.hex.toLowerCase());
      }
      for (const es of stored.effectStyles) {
        if (removedSet.has(es.key)) effectStyleMap.delete(es.effectType);
      }
    }
  }

  // Import only changed styles (added + modified) in parallel
  let imported = 0;
  const [textResults, paintResults, effectResults] = await Promise.all([
    Promise.allSettled(
      changedStyles.textStyles.map(async (ts) => {
        const style = await importWithTimeout(ts.key);
        return { fontSize: ts.fontSize, id: style.id, name: ts.name };
      }),
    ),
    Promise.allSettled(
      changedStyles.paintStyles.map(async (ps) => {
        const style = await importWithTimeout(ps.key);
        return { hex: ps.hex.toLowerCase(), id: style.id, name: ps.name };
      }),
    ),
    Promise.allSettled(
      changedStyles.effectStyles.map(async (es) => {
        const style = await importWithTimeout(es.key);
        return { effectType: es.effectType, id: style.id, name: es.name };
      }),
    ),
  ]);

  for (const r of textResults) {
    if (r.status === 'fulfilled') {
      textStyleMap.set(r.value.fontSize, { id: r.value.id, name: r.value.name });
      imported++;
    }
  }
  for (const r of paintResults) {
    if (r.status === 'fulfilled') {
      paintStyleMap.set(r.value.hex, { id: r.value.id, name: r.value.name });
      imported++;
    }
  }
  for (const r of effectResults) {
    if (r.status === 'fulfilled') {
      effectStyleMap.set(r.value.effectType, { id: r.value.id, name: r.value.name });
      imported++;
    }
  }

  // Persist full styles to clientStorage (source of truth)
  await figma.clientStorage.setAsync(storageKey(library), JSON.stringify(fullStyles));
  loadedLibrary = library;

  return {
    textStyles: textStyleMap.size,
    paintStyles: paintStyleMap.size,
    effectStyles: effectStyleMap.size,
  };
}

// ─── Clear (on library switch) ───

export function clearStyleRegistry(): void {
  textStyleMap.clear();
  paintStyleMap.clear();
  effectStyleMap.clear();
  loadedLibrary = null;
}
