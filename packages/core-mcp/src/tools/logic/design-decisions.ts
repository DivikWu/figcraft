/**
 * Design decisions extraction — extracts color/font/radius/spacing choices from
 * create_frame params for cross-screen consistency.
 *
 * Called by bridge after successful create_frame responses (non-dryRun).
 * - Creator mode: tracks all explicit choices for palette consistency.
 * - Library mode (target='libraryFallback'): tracks hardcoded hex/font fallbacks
 *   used when token binding was unavailable, ensuring fallback consistency across screens.
 */

import type { Bridge, DesignDecisions } from '../../bridge.js';

const HEX_RE = /^#[0-9a-f]{3,8}$/i;

/** Extract design decisions from create_frame params and merge into bridge cache. */
export function extractDesignDecisions(
  bridge: Bridge,
  params: Record<string, unknown>,
  target?: 'libraryFallback',
): void {
  const partial: Partial<DesignDecisions> = {};

  collectFromNode(params, partial);

  // Only merge if we found something
  if (
    partial.fillsUsed?.length ||
    partial.fontsUsed?.length ||
    partial.radiusValues?.length ||
    partial.spacingValues?.length ||
    partial.elevationStyle
  ) {
    bridge.mergeDesignDecisions(partial, target);
  }
}

function collectFromNode(node: Record<string, unknown>, out: Partial<DesignDecisions>): void {
  // Colors (normalize to uppercase for dedup)
  if (typeof node.fill === 'string' && HEX_RE.test(node.fill)) {
    (out.fillsUsed ??= []).push(node.fill.toUpperCase());
  }
  if (typeof node.strokeColor === 'string' && HEX_RE.test(node.strokeColor)) {
    (out.fillsUsed ??= []).push(node.strokeColor.toUpperCase());
  }

  // Fonts
  if (typeof node.fontFamily === 'string') {
    (out.fontsUsed ??= []).push(node.fontFamily);
  }

  // Radius
  if (typeof node.cornerRadius === 'number') {
    (out.radiusValues ??= []).push(node.cornerRadius);
  }

  // Spacing
  if (typeof node.itemSpacing === 'number') {
    (out.spacingValues ??= []).push(node.itemSpacing);
  }
  if (typeof node.padding === 'number') {
    (out.spacingValues ??= []).push(node.padding);
  }

  // Elevation
  if (node.shadow != null && !node.effectStyleName) {
    out.elevationStyle = 'elevated';
  } else if (node.blur != null) {
    out.elevationStyle = 'elevated';
  }

  // Recurse into children
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      if (child && typeof child === 'object') {
        collectFromNode(child as Record<string, unknown>, out);
      }
    }
  }

  // Recurse into batch items
  if (Array.isArray(node.items)) {
    for (const item of node.items) {
      if (item && typeof item === 'object') {
        collectFromNode(item as Record<string, unknown>, out);
      }
    }
  }
}
