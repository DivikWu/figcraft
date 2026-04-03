/**
 * execute_js handler — runs arbitrary JavaScript in the Figma Plugin sandbox.
 *
 * This is the FigCraft equivalent of Figma MCP's `use_figma` tool.
 * Code is wrapped in an async function with top-level await support.
 * The return value is JSON-serialized and sent back to the MCP server.
 *
 * Security: Figma's Plugin sandbox already restricts network access,
 * file system access, and DOM access. The FIGCRAFT_ACCESS level
 * controls whether this tool is available (requires 'edit' level).
 */

import { registerHandler } from '../registry.js';

export function registerExecuteJsHandler(): void {
  registerHandler('execute_js', async (params) => {
    const code = params.code as string;
    if (!code || typeof code !== 'string') {
      throw new Error('Missing required parameter: code (string)');
    }

    // Timeout: default 30s, max 120s
    // Note: the serial task queue also has a timeout (via _timeoutMs from bridge).
    // The bridge sets _timeoutMs slightly higher than this value, so this handler
    // timeout fires first and returns a structured error instead of a raw queue timeout.
    const timeoutMs = Math.min(Math.max(Number(params.timeoutMs) || 30_000, 1_000), 120_000);

    // Wrap user code in an async function so top-level await works.
    // The function receives `figma` implicitly (it's a global in the plugin sandbox).
    // We do NOT wrap in an IIFE — the user's code is the function body.
    const wrappedCode = `
      return (async () => {
        ${code}
      })();
    `;

    let result: unknown;
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function(wrappedCode);

      // Race against timeout, with proper timer cleanup
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        result = await Promise.race([
          fn(),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Script timed out after ${timeoutMs}ms`)), timeoutMs);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    } catch (err) {
      // Return structured error so the MCP side can relay it clearly
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      return {
        ok: false,
        error: message,
        ...(stack ? { stack } : {}),
      };
    }

    // Ensure the result is JSON-serializable
    try {
      // Round-trip through JSON to strip non-serializable values (functions, symbols, etc.)
      const serialized = JSON.parse(JSON.stringify(result ?? null));
      return { ok: true, result: serialized };
    } catch {
      return {
        ok: true,
        result: String(result),
        _warning: 'Result was not JSON-serializable and was converted to string',
      };
    }
  });
}
