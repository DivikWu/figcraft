/**
 * Plugin clientStorage keys — centralized to prevent typos and duplication.
 *
 * All handlers must import from here instead of defining their own string literals.
 */
export const STORAGE_KEYS = {
  CHANNEL: 'figcraft_channel',
  MODE: 'figcraft_mode',
  LIBRARY: 'figcraft_library',
  API_TOKEN: 'figcraft_api_token',
  LIBRARY_URLS: 'figcraft_library_urls',
  LANG: 'figcraft_lang',
  /** Prefix for per-library custom role mappings: `figcraft_role_mappings_<libraryName>` */
  ROLE_MAPPINGS_PREFIX: 'figcraft_role_mappings_',
} as const;

/** Plugin data keys stored on Figma nodes for FigCraft-specific semantics. */
export const PLUGIN_DATA_KEYS = {
  ROLE: 'figcraft_role',
  LINT_IGNORE: 'figcraft_lint_ignore',
} as const;

/** Plugin version — re-exported from shared single source of truth. */
export { VERSION as PLUGIN_VERSION } from '@figcraft/shared';

/** Sentinel value identifying the current file's local styles/variables as the design system source. */
export const LOCAL_LIBRARY = '__local__';

// ─── Layout constants ──────────────────────────────────────────────
// Canonical spacing used by auto-position logic across handlers.
//
// Hierarchy (outer → inner):
//   PAGE_GAP    : between top-level items on figma.currentPage
//   SECTION_*   : inside a SectionNode (padding from edges + gap between siblings)
//
// Rules:
//  - Inside a section, padding = gap (symmetric visual rhythm)
//  - Page-level has only gap, no padding (page has no meaningful "edge")
//  - NONE frames inherit page-level behavior (no padding, just gap)
//
// Values are 8pt-grid-aligned (80 = 10 × 8pt) per Figma design system convention.
// Kept as separate named constants even when values coincide so future tuning
// can diverge without refactoring call sites.

/** Left/top padding from a SectionNode's edges to its first child. */
export const SECTION_PADDING = 80;

/** Vertical gap between stacked siblings inside a SectionNode. */
export const SECTION_GAP = 80;

/** Vertical gap between top-level items on figma.currentPage. */
export const PAGE_GAP = 80;
