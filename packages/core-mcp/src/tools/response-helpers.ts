/**
 * Shared MCP response formatting helpers.
 */

export interface McpResponse {
  [x: string]: unknown;
  content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>;
  isError?: boolean;
}

/** Format a successful JSON response (pretty-printed, for human-readable outputs like mode info). */
export function jsonResponse(result: unknown): McpResponse {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}

/**
 * Format a successful JSON response in compact form (no indentation).
 * Use for data-dense tool responses (node trees, lint results, search results)
 * where whitespace adds 25-30% overhead with no benefit to LLM consumption.
 */
export function compactResponse(result: unknown): McpResponse {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
}

/** Format an error response. */
export function errorResponse(message: string): McpResponse {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: message }) }],
    isError: true,
  };
}

// ─── Structural truncation ───

/**
 * Structurally truncate a value to fit within a character budget.
 * Unlike json.slice(), this produces valid JSON by:
 * - Replacing deep children arrays with { _truncated: true, childCount: N }
 * - Trimming long arrays to first N items + { _remaining: M }
 * - Preserving the overall structure.
 */
export function truncateStructurally(value: unknown, maxChars: number): unknown {
  const json = JSON.stringify(value);
  if (json.length <= maxChars) return value;

  if (Array.isArray(value)) {
    return truncateArray(value, maxChars);
  }
  if (value && typeof value === 'object') {
    return truncateObject(value as Record<string, unknown>, maxChars);
  }
  return value;
}

function truncateArray(arr: unknown[], maxChars: number): unknown[] {
  // Binary search for how many items fit
  let lo = 1;
  let hi = arr.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const slice = arr.slice(0, mid);
    if (JSON.stringify(slice).length <= maxChars * 0.9) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  const kept = arr.slice(0, lo);
  const remaining = arr.length - lo;
  if (remaining > 0) {
    kept.push({ _remaining: remaining } as unknown);
  }
  return kept;
}

function truncateObject(obj: Record<string, unknown>, maxChars: number): Record<string, unknown> {
  // For node-tree-like objects: try to truncate children first
  if ('children' in obj && Array.isArray(obj.children)) {
    const childCount = (obj.children as unknown[]).length;
    const withoutChildren = { ...obj, children: [{ _truncated: true, childCount }] };
    if (JSON.stringify(withoutChildren).length <= maxChars) {
      // Children are the bottleneck — progressively include more
      const result = { ...obj };
      result.children = truncateArray(obj.children as unknown[], Math.round(maxChars * 0.6));
      return result;
    }
    // Even without children it's too big — strip children entirely
    const stripped = { ...obj };
    delete stripped.children;
    (stripped as Record<string, unknown>)._truncated = true;
    (stripped as Record<string, unknown>)._childCount = childCount;
    return stripped;
  }
  return obj;
}
