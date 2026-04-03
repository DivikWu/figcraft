/**
 * Centralized design constants — single source of truth for thresholds
 * used by both lint rules and AI prompt generation.
 */

export const DESIGN_CONSTANTS = {
  button: { minHeight: 44, minHPad: 16 },
  input: { minHPad: 8, defaultRadius: 8 },
  text: { minSize: 12, minLineHeightRatio: 1.0 },
  touch: { minSize: 44 },
  nesting: { maxDepth: 6 },
  spacing: { minSection: 12, sectionFix: 16 },
  screen: {
    ios: { width: 402, height: 874 },
    android: { width: 412, height: 915 },
  },
} as const;

/** Shared regex for identifying screen-like frames by name. */
export const SCREEN_NAME_RE =
  /welcome|sign.?in|sign.?up|forgot\s+password|create\s+account|screen|page|onboarding|settings|profile|dashboard|checkout|pricing|empty\s+state|home|landing|detail|list/i;
