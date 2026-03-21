/**
 * Tests for Bridge.guardResponseSize — response size limiting.
 */

import { describe, it, expect } from 'vitest';
import { Bridge } from '../src/mcp-server/bridge.js';

describe('Bridge.guardResponseSize', () => {
  it('passes through small responses unchanged', () => {
    const result = { id: '1:23', name: 'Frame', type: 'FRAME' };
    const guarded = Bridge.guardResponseSize(result, 'get_node_info');
    expect(guarded).toBe(result); // same reference
  });

  it('truncates oversized responses', () => {
    // Create a response that exceeds 50K chars
    const bigArray = Array.from({ length: 2000 }, (_, i) => ({
      id: `${i}:${i}`,
      name: `Node ${i} with a reasonably long name to inflate size`,
      type: 'FRAME',
      x: i * 10,
      y: i * 10,
      width: 100,
      height: 100,
      fills: [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }],
    }));
    const result = { children: bigArray };

    const guarded = Bridge.guardResponseSize(result, 'get_current_page') as Record<string, unknown>;
    expect(guarded._error).toBe('response_too_large');
    expect(guarded._sizeKB).toBeGreaterThan(0);
    expect(guarded.method).toBe('get_current_page');
    expect(guarded.hints).toBeDefined();
    expect(guarded._preview).toBeDefined();
    expect(typeof guarded._preview).toBe('string');
    expect((guarded._preview as string).length).toBeLessThanOrEqual(10_100); // 10K + some margin
  });

  it('uses custom hints when provided', () => {
    const bigStr = 'x'.repeat(60_000);
    const result = { data: bigStr };
    const guarded = Bridge.guardResponseSize(result, 'search_nodes', [
      'Use a more specific query',
    ]) as Record<string, unknown>;
    expect(guarded._error).toBe('response_too_large');
    expect(guarded.hints).toEqual(['Use a more specific query']);
  });

  it('handles exactly-at-limit responses', () => {
    // Create a response that's just under the limit
    const smallResult = { data: 'a'.repeat(40_000) };
    const guarded = Bridge.guardResponseSize(smallResult, 'test');
    expect(guarded).toBe(smallResult);
  });

  it('includes size info in KB', () => {
    const bigStr = 'x'.repeat(60_000);
    const result = { data: bigStr };
    const guarded = Bridge.guardResponseSize(result, 'test') as Record<string, unknown>;
    expect(guarded._sizeKB).toBeGreaterThan(50);
    expect(guarded._limitKB).toBe(Math.round(50_000 / 1024));
  });
});
