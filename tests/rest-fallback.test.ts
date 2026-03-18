/**
 * Tests for REST API fallback logic.
 *
 * Mocks file system operations to prevent writing to real disk.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs to prevent disk writes during tests
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    writeFileSync: vi.fn(),
    renameSync: vi.fn(),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => { throw new Error('ENOENT'); }),
  };
});

import {
  requestWithFallback,
  setFileContext,
  getFileContext,
  setFileKey,
} from '../src/mcp-server/rest-fallback.js';
import type { Bridge } from '../src/mcp-server/bridge.js';

// ─── Helpers ───

function mockBridge(behavior: 'success' | 'fail'): Bridge {
  return {
    request: behavior === 'success'
      ? vi.fn().mockResolvedValue({ id: '1:2', name: 'TestNode' })
      : vi.fn().mockRejectedValue(new Error('Request ping timed out after 30000ms')),
  } as unknown as Bridge;
}

// ─── Tests ───

describe('requestWithFallback', () => {
  beforeEach(() => {
    // Reset in-memory file context
    setFileContext('', '');
  });

  it('returns plugin result when bridge succeeds', async () => {
    const bridge = mockBridge('success');
    const { result, source } = await requestWithFallback(
      bridge,
      'get_node_info',
      { nodeId: '1:2' },
      async () => ({ id: '1:2', name: 'FromREST' }),
    );
    expect(source).toBe('plugin');
    expect(result).toEqual({ id: '1:2', name: 'TestNode' });
  });

  it('falls back to REST when bridge fails', async () => {
    const bridge = mockBridge('fail');
    const restData = { id: '1:2', name: 'FromREST', _source: 'rest-api' };
    const { result, source } = await requestWithFallback(
      bridge,
      'get_node_info',
      { nodeId: '1:2' },
      async () => restData,
    );
    expect(source).toBe('rest-api');
    expect(result).toEqual(restData);
  });

  it('throws original error when no fallback provided', async () => {
    const bridge = mockBridge('fail');
    await expect(
      requestWithFallback(bridge, 'get_node_info', { nodeId: '1:2' }),
    ).rejects.toThrow('timed out');
  });

  it('throws combined error when both plugin and REST fail', async () => {
    const bridge = mockBridge('fail');
    await expect(
      requestWithFallback(
        bridge,
        'get_node_info',
        { nodeId: '1:2' },
        async () => { throw new Error('No API token'); },
      ),
    ).rejects.toThrow(/Plugin:.*REST API fallback also failed/);
  });
});

describe('file context', () => {
  beforeEach(() => {
    setFileContext('', '');
  });

  it('stores and retrieves file context', () => {
    setFileContext('abc123', 'My Design');
    const ctx = getFileContext();
    expect(ctx).toEqual({ fileKey: 'abc123', documentName: 'My Design' });
  });

  it('setFileKey updates existing context', () => {
    setFileContext('old', 'Doc');
    setFileKey('new');
    expect(getFileContext()?.fileKey).toBe('new');
  });

  it('setFileKey creates context when none exists', () => {
    setFileKey('fresh');
    expect(getFileContext()?.fileKey).toBe('fresh');
  });
});
