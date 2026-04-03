/**
 * Unified handler error — thrown by plugin handlers for consistent error formatting.
 *
 * All handlers should `throw new HandlerError(...)` instead of `return { error: ... }`.
 * The SerialTaskQueue catches these and formats them as structured error responses.
 */

export class HandlerError extends Error {
  /** Machine-readable error code for programmatic handling. */
  readonly code: string;

  constructor(message: string, code = 'HANDLER_ERROR') {
    super(message);
    this.name = 'HandlerError';
    this.code = code;
  }
}

/**
 * Assert a condition, throwing HandlerError if false.
 * Replaces the `if (!x) return { error: ... }` pattern.
 */
export function assertHandler(condition: unknown, message: string, code = 'HANDLER_ERROR'): asserts condition {
  if (!condition) {
    throw new HandlerError(message, code);
  }
}
