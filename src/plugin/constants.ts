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
} as const;
