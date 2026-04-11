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

/**
 * Assert that a value is a node/style of one of the expected types.
 *
 * Self-correcting error messages: when an agent passes the WRONG kind of id
 * (e.g. a FRAME id to swap_instance), the error tells it the actual type and
 * suggests the right handler — saving a round-trip to re-list nodes. See
 * memory: feedback_self_correcting_errors.
 *
 * Generic over `{ type: string; name?: string }` so it works for both BaseNode
 * (Plugin scene nodes) and BaseStyle (paint/text/effect/grid styles).
 */
export function assertNodeType<T extends { type: string; name?: string }>(
  obj: T | null | undefined,
  expectedTypes: string | string[],
  paramName: string,
  handlerHint?: string,
): asserts obj is T {
  const expected = Array.isArray(expectedTypes) ? expectedTypes : [expectedTypes];
  if (!obj) {
    throw new HandlerError(
      `${paramName}: not found. The id may have been deleted, mistyped, or belong to another page. ` +
        `Use search_design_system, get_current_page, or list_local_components to find the right id.`,
      'NOT_FOUND',
    );
  }
  if (!('type' in obj) || typeof (obj as { type?: unknown }).type !== 'string') {
    throw new HandlerError(`${paramName}: value has no .type field (expected ${expected.join(' | ')})`, 'WRONG_TYPE');
  }
  const actualType = obj.type;
  if (!expected.includes(actualType)) {
    const nameField = obj.name;
    const nameSuffix = nameField ? ` (name: "${nameField}")` : '';
    const hint = handlerHint ? ` ${handlerHint}` : '';
    throw new HandlerError(
      `${paramName} expected ${expected.join(' | ')} but got ${actualType}${nameSuffix}.${hint}`,
      'WRONG_NODE_TYPE',
    );
  }
}
