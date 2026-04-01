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
