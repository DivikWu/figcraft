/**
 * WCAG 2.5.8 Target Size (Minimum, AA) — Spacing exception helper.
 *
 * Spec excerpt:
 *   "Undersized targets (those less than 24 by 24 CSS pixels) are positioned
 *    so that if a 24 CSS pixel diameter circle is centered on the bounding
 *    box of each, the circles do not intersect another target or the circle
 *    for another undersized target of the same size or smaller."
 *
 * Geometry: a 24-diameter circle centered on a H-tall (or W-wide) target
 * extends `12 - H/2` past each edge. If the target's parent is auto-layout
 * with itemSpacing ≥ that overflow, the circle cannot reach any neighbor,
 * so the exception applies and the target is tap-safe.
 *
 * Scope:
 *   - Only handles auto-layout (VERTICAL/HORIZONTAL) parents.
 *   - ABSOLUTE/NONE layouts are conservatively NOT exempted (would need full
 *     sibling geometry; rare in practice, can add later if needed).
 *   - Only checks the dimension aligned with parent axis (vertical neighbors
 *     in VERTICAL layout, horizontal in HORIZONTAL). Perpendicular dimension
 *     has no siblings in auto-layout.
 */

import type { AbstractNode } from '../types.js';

const WCAG_TARGET_DIAMETER = 24;

export interface SpacingExceptionResult {
  /** True iff the WCAG 2.5.8 Spacing exception is satisfied for this node. */
  exempt: boolean;
  /** Gap required to satisfy exception in the relevant axis (for diagnostics). */
  requiredGap: number;
  /** Actual parent gap (for diagnostics). */
  actualGap: number;
  /** Axis checked — helps tailor fix suggestions. */
  axis: 'vertical' | 'horizontal' | null;
}

/**
 * Evaluate whether `node` satisfies the WCAG 2.5.8 Spacing exception.
 * Callers should only invoke this when the node is known to be interactive
 * and undersized in at least one dimension.
 */
export function satisfiesSpacingException(node: AbstractNode): SpacingExceptionResult {
  const mode = node.parentLayoutMode;
  const gap = node.parentItemSpacing ?? 0;
  const h = node.height ?? 0;
  const w = node.width ?? 0;

  if (mode === 'VERTICAL') {
    // Vertical neighbors only — perpendicular (horizontal) has no sibling in a vertical stack.
    const overflow = Math.max(0, WCAG_TARGET_DIAMETER / 2 - h / 2);
    return {
      exempt: h >= WCAG_TARGET_DIAMETER || gap >= overflow,
      requiredGap: overflow,
      actualGap: gap,
      axis: 'vertical',
    };
  }
  if (mode === 'HORIZONTAL') {
    const overflow = Math.max(0, WCAG_TARGET_DIAMETER / 2 - w / 2);
    return {
      exempt: w >= WCAG_TARGET_DIAMETER || gap >= overflow,
      requiredGap: overflow,
      actualGap: gap,
      axis: 'horizontal',
    };
  }
  // Absolute / no parent layout — no exception without full sibling geometry.
  return { exempt: false, requiredGap: 0, actualGap: gap, axis: null };
}
