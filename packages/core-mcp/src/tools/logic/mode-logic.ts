/**
 * Mode logic functions — extracted from mode.ts server.tool() callbacks.
 * Used by get_mode / set_mode standalone tools.
 */

import { VERSION as SERVER_VERSION } from '@figcraft/shared';
import { getToken } from '../../auth.js';
import type { Bridge } from '../../bridge.js';
import { fetchLibraryComponentSets, fetchLibraryComponents, groupComponentsBySet } from '../../figma-api.js';
import { setFileContext } from '../../rest-fallback.js';
import { type ConnectionDiagnostic, diagnosticError } from '../connection-diagnostics.js';
import type { McpResponse } from './node-logic.js';
import { buildWorkflow } from './workflow-builder.js';

export async function getModeLogic(bridge: Bridge): Promise<McpResponse> {
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
    // Diagnose the specific failure reason
    if (bridge.isEvicted) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(diagnosticError('evicted')) }],
      };
    }
    const probe = await bridge.probeRelay();
    let diag: ConnectionDiagnostic;
    if (!probe.reachable) {
      diag = diagnosticError('relay_unreachable');
    } else if (!probe.pluginConnected) {
      diag = diagnosticError('plugin_not_connected');
    } else {
      diag = diagnosticError('plugin_not_responding');
    }
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(diag),
        },
      ],
    };
  }

  // Ping to verify end-to-end connectivity and cache file context
  let pingLatency: string | undefined;
  let versionWarning: string | undefined;
  try {
    const pingStart = Date.now();
    const pingResult = (await bridge.request('ping', {})) as Record<string, unknown>;
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
      const retryResult = (await bridge.request('ping', {})) as Record<string, unknown>;
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
      // Diagnose why plugin isn't responding
      const probe = await bridge.probeRelay();
      const diag = probe.pluginConnected
        ? diagnosticError('plugin_not_responding')
        : diagnosticError('plugin_not_connected');
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(diag),
          },
        ],
      };
    }
  }

  // Phase 2.5: Built-in page inspection (replaces separate get_current_page call in Create workflow)
  let pageContext: { isEmpty: boolean; childCount: number; topFrameNames: string[] } | undefined;
  try {
    const pageResult = (await bridge.request('get_current_page', {
      maxDepth: 1,
      maxNodes: 20,
      detail: 'summary',
    })) as Record<string, unknown>;
    const childCount = typeof pageResult.childCount === 'number' ? pageResult.childCount : 0;
    const nodes = Array.isArray(pageResult.nodes) ? (pageResult.nodes as Record<string, unknown>[]) : [];
    pageContext = {
      isEmpty: childCount === 0 && nodes.length === 0,
      childCount,
      topFrameNames: nodes.slice(0, 10).map((n) => (n.name as string) || 'unnamed'),
    };
  } catch {
    // Page inspection failed — non-fatal, continue without it
    pageContext = undefined;
  }

  const result = (await bridge.request('get_mode', {})) as {
    mode: string;
    selectedLibrary?: string;
    designContext?: unknown;
    libraryFileKey?: string | null;
  };

  // Mark mode as queried (unlocks UI creation tools)
  bridge.modeQueried = true;
  // Cache selectedLibrary state on bridge (used by search_design_system guard)
  bridge.selectedLibrary = result.selectedLibrary ?? null;

  // Cache designContext.defaults on bridge (used by creation-guide for token mapping injection)
  const designCtx = result.designContext as Record<string, unknown> | null;
  bridge.designContextDefaults =
    designCtx && typeof designCtx.defaults === 'object' && designCtx.defaults !== null
      ? (designCtx.defaults as Record<string, { name: string } | null>)
      : null;

  // Cache fileKey from plugin response (survives MCP restarts)
  if (result.selectedLibrary && result.libraryFileKey) {
    bridge.setLibraryFileKey(result.selectedLibrary, result.libraryFileKey);
  }

  // Enrich with local components for __local__ mode (mirrors libraryComponents for library mode)
  if (result.selectedLibrary === '__local__') {
    try {
      const localComps = (await bridge.request('list_local_components', {})) as Record<string, unknown>;
      (result as Record<string, unknown>).localComponents = localComps;
    } catch (err) {
      console.warn('[FigCraft] Failed to enumerate local components:', err);
      (result as Record<string, unknown>).localComponentsError =
        `Failed to enumerate local components: ${err instanceof Error ? err.message : String(err)}.`;
    }
  }

  // Enrich with library components if fileKey is available
  const fileKey =
    result.libraryFileKey ?? (result.selectedLibrary ? bridge.getLibraryFileKey(result.selectedLibrary) : null);
  if (fileKey) {
    try {
      const token = await getToken();
      const [components, componentSets] = await Promise.all([
        fetchLibraryComponents(fileKey, token),
        fetchLibraryComponentSets(fileKey, token),
      ]);
      const grouped = groupComponentsBySet(components, componentSets);
      // Cache full REST result for search_design_system reuse (60s TTL)
      bridge.setRestComponentCache(fileKey, grouped);
      // Compress for get_mode: summary with variant property options (reduces search_design_system calls)
      // Group by containingFrame so AI sees category context before selecting components
      // (prevents misselection like "Credit Card" for a generic input field)
      const byCategory: Record<string, Array<Record<string, unknown>>> = {};
      for (const cs of grouped.componentSets) {
        const category = cs.containingFrame || 'Uncategorized';
        if (!byCategory[category]) byCategory[category] = [];
        // Collect unique values per property across all variants
        const propertyOptions: Record<string, string[]> = {};
        for (const variant of cs.variants) {
          for (const [propName, propValue] of Object.entries(variant.properties)) {
            if (!propertyOptions[propName]) propertyOptions[propName] = [];
            if (!propertyOptions[propName].includes(propValue)) {
              propertyOptions[propName].push(propValue);
            }
          }
        }
        byCategory[category].push({
          key: cs.key,
          name: cs.name,
          description: cs.description,
          variantCount: cs.variants.length,
          propertyOptions,
        });
      }
      const summary = {
        componentSets: byCategory,
        standalone: grouped.standalone,
        _note:
          'Components are grouped by containingFrame (library section). Pick from the category matching your semantic intent. ' +
          'Use componentSetKey + variantProperties to instantiate variants. For component details beyond this summary, call components(method:"list_properties").',
      };
      (result as Record<string, unknown>).libraryComponents = summary;
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
  if (
    result.selectedLibrary &&
    !(result as Record<string, unknown>).libraryComponents &&
    !(result as Record<string, unknown>).libraryComponentsError
  ) {
    (result as Record<string, unknown>).libraryComponentsUnavailable = true;
  }

  // Build structured workflow instructions via pure function (testable independently)
  (result as Record<string, unknown>)._workflow = buildWorkflow({
    selectedLibrary: result.selectedLibrary ?? null,
    designDecisions: bridge.designDecisions,
    libraryFallbackDecisions: bridge.libraryFallbackDecisions,
    designContext: (result.designContext as Record<string, unknown> | null) ?? null,
    localComponents: (result as Record<string, unknown>).localComponents as Record<string, unknown> | undefined,
    migrationContext: result.selectedLibrary ? bridge.consumeMigrationContext() : null,
  });

  // Add connectivity info to response
  const response: Record<string, unknown> = {
    connected: true,
    latency: pingLatency,
    ...(versionWarning ? { versionWarning } : {}),
    ...(pageContext ? { pageContext } : {}),
    ...(result as Record<string, unknown>),
  };

  // ── Inject recent errors from error journal (cross-turn learning) ──
  const recentErrors = bridge.session.getRecentErrors();
  if (recentErrors.length > 0 && response._workflow && typeof response._workflow === 'object') {
    (response._workflow as Record<string, unknown>)._recentErrors = recentErrors;
  }

  // ── _workflow diff-aware caching ──
  // Compute a simple hash of the _workflow JSON. If unchanged since last call,
  // replace the full _workflow with a compact cached marker to save ~120 lines of tokens.
  const workflow = response._workflow;
  if (workflow) {
    const workflowJson = JSON.stringify(workflow);
    // Simple string hash (djb2)
    let hash = 5381;
    for (let i = 0; i < workflowJson.length; i++) {
      hash = ((hash << 5) + hash + workflowJson.charCodeAt(i)) | 0;
    }
    const hashStr = String(hash);

    if (bridge.lastWorkflowHash === hashStr) {
      // Workflow unchanged — return compact cached marker
      response._workflow = {
        _cached: true,
        mode: (workflow as Record<string, unknown>).mode,
        description: (workflow as Record<string, unknown>).description,
      };
    } else {
      // First call or changed — return full workflow and cache hash
      bridge.lastWorkflowHash = hashStr;
    }
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(response, null, 2),
      },
    ],
  };
}
