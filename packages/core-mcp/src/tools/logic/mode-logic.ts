/**
 * Mode logic functions — extracted from mode.ts server.tool() callbacks.
 * Used by get_mode / set_mode standalone tools.
 */

import type { Bridge } from '../../bridge.js';
import { fetchLibraryComponents } from '../../figma-api.js';
import { getToken } from '../../auth.js';
import { setFileContext } from '../../rest-fallback.js';
import { VERSION as SERVER_VERSION } from '@figcraft/shared';
import type { McpResponse } from './node-logic.js';

export async function getModeLogic(
  bridge: Bridge,
): Promise<McpResponse> {
  // Built-in connectivity check (replaces separate ping call in Create workflow)
  if (!bridge.isConnected) {
    // Try reconnecting — the bridge may have been evicted or disconnected
    try {
      await bridge.connect();
      await bridge.discoverPluginChannel();
    } catch {
      // Still not connected
    }
  }

  if (!bridge.isConnected) {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          connected: false,
          error: 'Not connected to Figma. Open the FigCraft plugin in Figma and try again.',
        }),
      }],
    };
  }

  // Ping to verify end-to-end connectivity and cache file context
  let pingLatency: string | undefined;
  let versionWarning: string | undefined;
  try {
    const pingStart = Date.now();
    const pingResult = await bridge.request('ping', {}) as Record<string, unknown>;
    pingLatency = `${Date.now() - pingStart}ms`;

    const pluginVersion = pingResult.pluginVersion as string | undefined;
    if (pluginVersion && pluginVersion !== SERVER_VERSION) {
      versionWarning = `Version mismatch: MCP Server ${SERVER_VERSION}, Plugin ${pluginVersion}. Please rebuild the plugin.`;
    }

    const fileKey = pingResult.fileKey as string | undefined;
    const documentName = pingResult.documentName as string | undefined;
    if (fileKey && documentName) {
      setFileContext(fileKey, documentName);
    }
  } catch {
    // Ping failed — try auto-discovering the plugin's channel and retry
    try {
      await bridge.discoverPluginChannel();
      const retryStart = Date.now();
      const retryResult = await bridge.request('ping', {}) as Record<string, unknown>;
      pingLatency = `${Date.now() - retryStart}ms`;

      const pluginVersion = retryResult.pluginVersion as string | undefined;
      if (pluginVersion && pluginVersion !== SERVER_VERSION) {
        versionWarning = `Version mismatch: MCP Server ${SERVER_VERSION}, Plugin ${pluginVersion}. Please rebuild the plugin.`;
      }

      const fileKey = retryResult.fileKey as string | undefined;
      const documentName = retryResult.documentName as string | undefined;
      if (fileKey && documentName) {
        setFileContext(fileKey, documentName);
      }
    } catch {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            connected: false,
            error: 'Plugin not responding. Make sure the FigCraft plugin is open in Figma.',
          }),
        }],
      };
    }
  }

  const result = await bridge.request('get_mode', {}) as {
    mode: string;
    selectedLibrary?: string;
    designContext?: unknown;
    libraryFileKey?: string | null;
  };

  // Cache fileKey from plugin response (survives MCP restarts)
  if (result.selectedLibrary && result.libraryFileKey) {
    bridge.setLibraryFileKey(result.selectedLibrary, result.libraryFileKey);
  }

  // Enrich with library components if fileKey is available
  const fileKey = result.libraryFileKey ?? (result.selectedLibrary ? bridge.getLibraryFileKey(result.selectedLibrary) : null);
  if (fileKey) {
    try {
      const token = await getToken();
      const components = await fetchLibraryComponents(fileKey, token);
      (result as Record<string, unknown>).libraryComponents = components.map((c) => ({
        key: c.key,
        name: c.name,
        description: c.description,
      }));
    } catch (err) {
      console.warn('[FigCraft] Failed to fetch library components:', err);
      (result as Record<string, unknown>).libraryComponentsError =
        `Failed to fetch library components: ${err instanceof Error ? err.message : String(err)}. ` +
        'Use components(method: "list_library") to retry.';
    }
  }

  // Remove internal field from response
  delete (result as Record<string, unknown>).libraryFileKey;

  // Signal when library is selected but components couldn't be loaded
  if (result.selectedLibrary && !(result as Record<string, unknown>).libraryComponents && !(result as Record<string, unknown>).libraryComponentsError) {
    (result as Record<string, unknown>).libraryComponentsUnavailable = true;
  }

  // Short, actionable hint
  if (result.selectedLibrary) {
    (result as Record<string, unknown>)._hint =
      'Library mode — tokens and components loaded. ' +
      'NEXT: Reply to user to gather missing preferences (UI type, platform). ' +
      'Do NOT call any more tools. If user provided everything, reply with design proposal instead.';
  } else {
    (result as Record<string, unknown>)._hint =
      'Design Creator mode — no library selected, no tokens to query. ' +
      'NEXT: Reply to user to gather missing preferences (UI type, platform, style tone). ' +
      'Do NOT call any more tools. If user provided everything, reply with design proposal instead.';
  }

  // Add connectivity info to response
  const response: Record<string, unknown> = {
    connected: true,
    latency: pingLatency,
    ...(versionWarning ? { versionWarning } : {}),
    ...result as Record<string, unknown>,
  };

  // Plugin channel status is reported by `ping` — not duplicated here
  // to avoid adding latency to get_mode.

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(response, null, 2),
    }],
  };
}
