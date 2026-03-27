/**
 * Component logic functions — extracted from components.ts server.tool() callbacks.
 * Used by endpoint tools for library component operations.
 */

import type { Bridge } from '../../bridge.js';
import { fetchLibraryComponents } from '../../figma-api.js';
import { getToken } from '../../auth.js';
import type { McpResponse } from './node-logic.js';

/**
 * List published library components via REST API.
 * Resolves fileKey from: param → plugin get_mode → bridge cache.
 */
export async function listLibraryComponentsLogic(
  bridge: Bridge,
  params: { fileKey?: string },
): Promise<McpResponse> {
  try {
    let resolvedKey = params.fileKey ?? null;
    if (!resolvedKey) {
      const modeResult = await bridge.request('get_mode', {}) as {
        selectedLibrary?: string;
        libraryFileKey?: string | null;
      };
      if (modeResult.selectedLibrary) {
        resolvedKey = modeResult.libraryFileKey ?? bridge.getLibraryFileKey(modeResult.selectedLibrary);
        if (resolvedKey) {
          bridge.setLibraryFileKey(modeResult.selectedLibrary, resolvedKey);
        }
      }
    }
    if (!resolvedKey) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: 'No fileKey available. Paste the library file URL in the FigCraft plugin panel, or provide the fileKey parameter.' }],
      };
    }
    const token = await getToken();
    const components = await fetchLibraryComponents(resolvedKey, token);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ count: components.length, components }, null, 2) }],
    };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }],
    };
  }
}
