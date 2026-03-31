/**
 * Mode logic functions — extracted from mode.ts server.tool() callbacks.
 * Used by get_mode / set_mode standalone tools.
 */

import type { Bridge } from '../../bridge.js';
import { fetchLibraryComponents, fetchLibraryComponentSets, groupComponentsBySet } from '../../figma-api.js';
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

  // Mark mode as queried (unlocks UI creation tools)
  bridge.modeQueried = true;
  // Cache selectedLibrary state on bridge (used by search_design_system guard)
  bridge.selectedLibrary = result.selectedLibrary ?? null;

  // Cache fileKey from plugin response (survives MCP restarts)
  if (result.selectedLibrary && result.libraryFileKey) {
    bridge.setLibraryFileKey(result.selectedLibrary, result.libraryFileKey);
  }

  // Enrich with library components if fileKey is available
  const fileKey = result.libraryFileKey ?? (result.selectedLibrary ? bridge.getLibraryFileKey(result.selectedLibrary) : null);
  if (fileKey) {
    try {
      const token = await getToken();
      const [components, componentSets] = await Promise.all([
        fetchLibraryComponents(fileKey, token),
        fetchLibraryComponentSets(fileKey, token),
      ]);
      const grouped = groupComponentsBySet(components, componentSets);
      (result as Record<string, unknown>).libraryComponents = grouped;
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

  // Structured workflow instructions — the single source of truth for all IDEs.
  // Replaces the old _hint with actionable, enforceable steps.
  const hasLibrary = !!result.selectedLibrary;
  (result as Record<string, unknown>)._workflow = {
    mode: hasLibrary ? 'design-guardian' : 'design-creator',
    description: hasLibrary
      ? 'Library mode — use library tokens and components. Exercise restraint, match existing patterns.'
      : 'Creator mode — no library. Make intentional design choices, avoid AI defaults (blue/gray/Inter).',

    // ⛔ BLOCKING: must complete before ANY write tool call
    designPreflight: {
      required: true,
      instruction: 'Complete the design checklist below, then present a design proposal to the user and WAIT for explicit confirmation. Do NOT call create_frame/create_text/create_svg/execute_js until user approves.',
      checklist: {
        purpose: 'What problem does this solve? Who is the audience?',
        platform: 'iOS (402×874) / Android (412×915) / Web? Determines touch targets and conventions.',
        language: 'What language for UI text? Determines font choice and content.',
        density: 'Sparse form vs dense dashboard — how much info per screen?',
        tone: 'Minimal ← Elegant ← Warm → Bold → Maximal — pick a clear position.',
      },
      colorRules: hasLibrary
        ? 'Use library color tokens. Match existing palette. Do not hardcode hex values when tokens are available.'
        : '1 dominant + 1 accent, total ≤ 5. Dominant at 60%+. NEVER default to blue/gray without justification.',
      typographyRules: hasLibrary
        ? 'Use library text styles. Clear heading/body distinction via existing style tiers.'
        : 'Clear heading/body distinction (different weight or size). ≤ 3 font weights. NEVER use only Inter without justification.',
      contentRules: 'Realistic, contextually appropriate text. NEVER use "Lorem ipsum", "Text goes here", "Button", "Title".',
      iconRules: 'Single icon style per design (outline/filled/duotone). Use icon_search + icon_create, NOT emoji placeholders.',
      antiSlop: 'No cheap gradients/glow effects. Vary corner radius across hierarchy. Prefer asymmetry over symmetry.',
    },

    // After user confirms the design proposal:
    creationSteps: [
      'get_current_page(maxDepth=1) — inspect existing content, find placement position',
      'Classify task scale: single element / single screen / multi-screen (3-5) / large flow (6+)',
      'Use create_frame + children (declarative) as default. execute_js only for loops/conditionals/unsupported API.',
      'Verify each create_frame response: check _children and _preview. Call export_image only if _preview shows issues.',
      'lint_fix_all on completed screens before replying to user.',
    ],

    // What to do RIGHT NOW (next action for AI)
    nextAction: hasLibrary
      ? 'Reply to user: present design proposal based on available library tokens/components and user request. WAIT for confirmation.'
      : 'Reply to user: gather missing preferences (platform, style tone, color palette) OR present design proposal if user provided enough detail. WAIT for confirmation.',
  };

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
