/**
 * Tests for Bridge.guardResponseSize — response size limiting.
 */

import { describe, it, expect } from 'vitest';
import { Bridge } from '../../packages/core-mcp/src/bridge.js';

describe('Bridge.guardResponseSize', () => {
  it('passes through small responses unchanged', () => {
    const result = { id: '1:23', name: 'Frame', type: 'FRAME' };
    const guarded = Bridge.guardResponseSize(result, 'get_node_info');
    expect(guarded).toBe(result); // same reference
  });

  it('structurally truncates oversized tree responses', () => {
    // Create a response with children that exceeds 50K chars
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
    // Structural truncation should succeed — keeps valid JSON with fewer children
    expect(guarded._error).toBeUndefined();
    expect(guarded.children).toBeDefined();
    expect(Array.isArray(guarded.children)).toBe(true);
    // Should have fewer items than original + a _remaining marker
    const children = guarded.children as unknown[];
    expect(children.length).toBeLessThan(bigArray.length);
    const lastChild = children[children.length - 1] as Record<string, unknown>;
    expect(lastChild._remaining).toBeGreaterThan(0);
    // Should include _truncatedFromKB metadata
    expect(guarded._truncatedFromKB).toBeGreaterThan(0);
    // Result should be valid JSON within budget
    expect(JSON.stringify(guarded).length).toBeLessThanOrEqual(Bridge.MAX_RESPONSE_CHARS);
  });

  it('falls back to error when structural truncation insufficient', () => {
    // A single massive string can't be structurally truncated
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

  it('includes size info in error fallback', () => {
    const bigStr = 'x'.repeat(60_000);
    const result = { data: bigStr };
    const guarded = Bridge.guardResponseSize(result, 'test') as Record<string, unknown>;
    expect(guarded._sizeKB).toBeGreaterThan(50);
    expect(guarded._limitKB).toBe(Math.round(50_000 / 1024));
  });
});
