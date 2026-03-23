/**
 * Type guards for Figma variable values.
 *
 * Figma's `valuesByMode` returns union types (e.g. `RGB | RGBA | VariableAlias`)
 * that can't be directly cast to `Record<string, unknown>`. These guards provide
 * safe narrowing without double-cast (`as unknown as Record`).
 */

/** Check if a value is a VariableAlias (`{ type: 'VARIABLE_ALIAS', id: string }`). */
export function isVariableAlias(val: unknown): val is { type: 'VARIABLE_ALIAS'; id: string } {
  return val !== null && typeof val === 'object' && 'type' in (val as object) &&
    (val as { type: unknown }).type === 'VARIABLE_ALIAS';
}

/** Check if a value looks like an RGB/RGBA color object (has `r` property). */
export function isRgbaLike(val: unknown): val is RGBA {
  return val !== null && typeof val === 'object' && 'r' in (val as object);
}

/** Writable spacing/layout properties on FrameNode that lint fixes may set. */
const WRITABLE_SPACING_PROPS = new Set([
  'itemSpacing', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom',
  'counterAxisSpacing',
]);

/** Node type that supports spacing properties. */
type SpacingNode = BaseNode & Record<string, unknown>;

/** Safely set a spacing property on a node (only allows known writable props). */
export function setSpacingProp(node: BaseNode, prop: string, value: number): boolean {
  if (!WRITABLE_SPACING_PROPS.has(prop) || !(prop in node)) return false;
  (node as SpacingNode)[prop] = value;
  return true;
}
