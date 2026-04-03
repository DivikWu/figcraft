/**
 * Tests for centralized cache manager.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

// Dynamic import to get a fresh module per test (registry is module-scoped)
async function loadCacheManager() {
  // Vitest module cache means we need to reset between describes
  const mod = await import('../../packages/adapter-figma/src/utils/cache-manager.js');
  return mod;
}

describe('cache-manager', () => {
  let registerCache: Awaited<ReturnType<typeof loadCacheManager>>['registerCache'];
  let clearAllCaches: Awaited<ReturnType<typeof loadCacheManager>>['clearAllCaches'];
  let clearCache: Awaited<ReturnType<typeof loadCacheManager>>['clearCache'];
  let listCaches: Awaited<ReturnType<typeof loadCacheManager>>['listCaches'];

  // Load module once (shared registry state across tests in this describe)
  const setup = loadCacheManager().then((mod) => {
    registerCache = mod.registerCache;
    clearAllCaches = mod.clearAllCaches;
    clearCache = mod.clearCache;
    listCaches = mod.listCaches;
  });

  afterEach(() => {
    // Re-register to clean state for next test isn't needed —
    // we test in sequence and each test uses unique names
  });

  it('registers and lists caches', async () => {
    await setup;
    const spy = vi.fn();
    registerCache('test-a', spy);
    expect(listCaches()).toContain('test-a');
  });

  it('clearAllCaches calls all registered callbacks', async () => {
    await setup;
    const spy1 = vi.fn();
    const spy2 = vi.fn();
    registerCache('test-b1', spy1);
    registerCache('test-b2', spy2);
    clearAllCaches();
    expect(spy1).toHaveBeenCalledOnce();
    expect(spy2).toHaveBeenCalledOnce();
  });

  it('clearCache calls only the named callback', async () => {
    await setup;
    const spy1 = vi.fn();
    const spy2 = vi.fn();
    registerCache('test-c1', spy1);
    registerCache('test-c2', spy2);
    clearCache('test-c1');
    expect(spy1).toHaveBeenCalledOnce();
    expect(spy2).not.toHaveBeenCalled();
  });

  it('clearCache is a no-op for unknown name', async () => {
    await setup;
    expect(() => clearCache('nonexistent')).not.toThrow();
  });

  it('clearAllCaches swallows errors from callbacks', async () => {
    await setup;
    registerCache('test-d', () => {
      throw new Error('boom');
    });
    // Should not throw — errors are caught and warned
    expect(() => clearAllCaches()).not.toThrow();
  });
});
