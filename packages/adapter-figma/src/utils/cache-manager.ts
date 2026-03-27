/**
 * Centralized cache manager — modules register their clear callbacks,
 * and a single `clearAll()` call invalidates everything.
 *
 * Replaces the scattered pattern of calling 5+ individual clear functions
 * from code.ts on library/mode switch.
 */

type ClearCallback = () => void;

const registry = new Map<string, ClearCallback>();

/** Register a cache clear callback. Call during module initialization. */
export function registerCache(name: string, clear: ClearCallback): void {
  registry.set(name, clear);
}

/** Clear all registered caches. Call on library switch, mode change, etc. */
export function clearAllCaches(): void {
  for (const [name, clear] of registry) {
    try {
      clear();
    } catch (err) {
      console.warn(`[figcraft] cache clear failed for "${name}":`, err instanceof Error ? err.message : String(err));
    }
  }
}

/** Clear a specific named cache. */
export function clearCache(name: string): void {
  const clear = registry.get(name);
  if (clear) {
    try {
      clear();
    } catch (err) {
      console.warn(`[figcraft] cache clear failed for "${name}":`, err instanceof Error ? err.message : String(err));
    }
  }
}

/** Get the names of all registered caches (for diagnostics). */
export function listCaches(): string[] {
  return [...registry.keys()];
}
