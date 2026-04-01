/**
 * Shared MCP response formatting helpers.
 */

export interface McpResponse {
  [x: string]: unknown;
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
  >;
  isError?: boolean;
}

/** Format a successful JSON response. */
export function jsonResponse(result: unknown): McpResponse {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}

/** Format an error response. */
export function errorResponse(message: string): McpResponse {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: message }, null, 2) }],
    isError: true,
  };
}
