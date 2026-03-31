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

/** Format a successful JSON response. Extracts _preview into an image content block if present. */
export function jsonResponse(result: unknown): McpResponse {
  const obj = result as Record<string, unknown> | null;
  const preview = obj?._preview as { base64: string } | undefined;

  if (preview?.base64) {
    const { _preview, ...rest } = obj!;
    return {
      content: [
        { type: 'image' as const, data: preview.base64, mimeType: 'image/png' },
        { type: 'text' as const, text: JSON.stringify(rest, null, 2) },
      ],
    };
  }

  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}

/** Format an error response. */
export function errorResponse(message: string): McpResponse {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: message }, null, 2) }],
    isError: true,
  };
}
