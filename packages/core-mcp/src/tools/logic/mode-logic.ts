/**
 * Mode logic functions — extracted from mode.ts server.tool() callbacks.
 * Used by get_mode / set_mode standalone tools.
 */

import { VERSION as SERVER_VERSION } from '@figcraft/shared';
import { getToken } from '../../auth.js';
import type { Bridge } from '../../bridge.js';
import { fetchLibraryComponentSets, fetchLibraryComponents, groupComponentsBySet } from '../../figma-api.js';
import { setFileContext } from '../../rest-fallback.js';
import type { McpResponse } from './node-logic.js';

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
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            connected: false,
            error: 'Not connected to Figma. Open the FigCraft plugin in Figma and try again.',
          }),
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
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              connected: false,
              error: 'Plugin not responding. Make sure the FigCraft plugin is open in Figma.',
            }),
          },
        ],
      };
    }
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

  // Cache fileKey from plugin response (survives MCP restarts)
  if (result.selectedLibrary && result.libraryFileKey) {
    bridge.setLibraryFileKey(result.selectedLibrary, result.libraryFileKey);
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
      // Compress for get_mode: summary only (full variants via search_design_system)
      const summary = {
        componentSets: grouped.componentSets.map((cs) => ({
          key: cs.key,
          name: cs.name,
          description: cs.description,
          variantCount: cs.variants.length,
          // Keep only first variant's property keys as schema hint
          propertyNames: cs.variants.length > 0 ? Object.keys(cs.variants[0].properties) : [],
        })),
        standalone: grouped.standalone,
        _note:
          'Variant details omitted. Use search_design_system(query) or components(method:"list_properties") for full variant info.',
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
      instruction:
        'Complete the design checklist below, then present a design proposal to the user and WAIT for explicit confirmation. Do NOT call create_frame/create_text/create_svg until user approves.',
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
      contentRules:
        'Realistic, contextually appropriate text. NEVER use "Lorem ipsum", "Text goes here", "Button", "Title".',
      iconRules: hasLibrary
        ? 'Use library icon components first (search_design_system query:"icon"). Fall back to icon_search + icon_create only when library has no match. NEVER use text characters as icon placeholders.'
        : 'Single icon style per design (outline/filled/duotone). Use icon_search + icon_create for ALL icons. NEVER use text characters as icon placeholders (">" for chevron, "..." for more).',
      antiSlop: 'No cheap gradients/glow effects. Vary corner radius across hierarchy. Prefer asymmetry over symmetry.',
    },

    // After user confirms the design proposal:
    creationSteps: [
      'get_current_page(maxDepth=1) — inspect existing content, find placement position.',
      'Classify task scale: single element / single screen / multi-screen (3-5) / large flow (6+).',
      'Use create_frame + children (declarative) for all creation. children support optional index field for insertion order. type:"rectangle" for simple shapes (dividers, spacers), type:"frame" for containers with children/auto-layout. For text range styling: text(method:"set_range"). For grouping: group_nodes (requires load_toolset("shapes-vectors")). For complex layouts, call get_creation_guide(topic:"layout") for structural rules.',
      '⚠️ SIZING: Root screen frames MUST include layoutSizingHorizontal:"FIXED" + layoutSizingVertical:"FIXED" explicitly. Without this, Opinion Engine infers HUG and the frame collapses to content size.',
      '⚠️ PLACEHOLDERS: Use type:"frame" (not "rectangle") for any container that needs children later (logos, avatars, chart areas). Rectangles cannot have children. Add layoutMode:"HORIZONTAL", primaryAxisAlignItems:"CENTER", counterAxisAlignItems:"CENTER" to center content inside.',
      hasLibrary
        ? '⚠️ ICONS: Before calling create_frame, plan all icons needed. Use search_design_system(query:"icon chevron") to find library icon components first. Fall back to icon_search + icon_create only when library has no match. NEVER use text characters as icon placeholders (">" for chevron, "..." for more menu).'
        : '⚠️ ICONS: Before calling create_frame, plan all icons needed (navigation chevrons, social logos, action icons). Call icon_search to find icons, then include icon_create calls AFTER create_frame. NEVER use text characters as icon placeholders (">" for chevron, "..." for more menu).',
      'nodes update: ordered execution (simple props → fills/strokes → layout sizing → resize → text). Supports width/height directly, text properties, layoutPositioning. Safe to send layoutMode + width in same patch.',
      'For complex or ambiguous parameters, use dryRun:true first to preview Opinion Engine inferences before committing.',
      'After the FIRST create_frame failure, review ALL remaining planned payloads for the same pattern before retrying.',
      'Verify each create_frame response: check _children structure. Use export_image(scale:0.5) for visual verification when needed.',
      'lint_fix_all on completed screens (supports dryRun:true to preview). If remaining violations include severity:"error", read the details and fix manually before replying.',
    ],

    // Key tool behavior rules (full version: get_creation_guide(topic:"tool-behavior"))
    toolBehavior: [
      'Prefer batch tools: lint_fix_all over lint_check+lint_fix, create_frame items[] for multiple screens.',
      'nodes(method:"update") uses 5-phase ordered execution: simple → fills → sizing → resize → text.',
      'dryRun:true for complex/ambiguous params — preview before committing.',
    ],

    // Where to find detailed rules (accessible via MCP tools in ALL IDEs)
    references: {
      layoutRules: 'get_creation_guide(topic:"layout") — structural layout rules from Quality Engine',
      multiScreen: 'get_creation_guide(topic:"multi-screen") — multi-screen flow architecture',
      batchStrategy: 'get_creation_guide(topic:"batching") — context budget and batching strategy',
      toolPatterns: 'get_creation_guide(topic:"tool-behavior") — tool usage patterns',
      opinionEngine: 'get_creation_guide(topic:"opinion-engine") — create_frame auto-inference docs',
      designRules: 'get_design_guidelines(category) — aesthetic design direction rules',
    },

    // How search_design_system behaves in this mode
    searchBehavior: hasLibrary
      ? result.selectedLibrary === '__local__'
        ? 'search_design_system searches local variables and styles only (no REST API). Use it to find existing local tokens before creating.'
        : 'search_design_system searches local + library components via REST API. Use it to discover reusable tokens and components.'
      : 'search_design_system is disabled (no library selected). Skip it — make intentional design choices directly.',

    // What to do RIGHT NOW (next action for AI)
    nextAction: hasLibrary
      ? 'Reply to user: present design proposal based on available library tokens/components and user request. WAIT for confirmation.'
      : 'Reply to user: gather missing preferences (platform, style tone, color palette) OR present design proposal if user provided enough detail. WAIT for confirmation.',
  };

  // Detect sparse local tokens for __local__ mode
  if (result.selectedLibrary === '__local__') {
    const ctx = result.designContext as Record<string, unknown> | null;
    const hasTokens =
      ctx &&
      ((Array.isArray(ctx.colorVariables) && (ctx.colorVariables as unknown[]).length > 0) ||
        (Array.isArray(ctx.textStyles) && (ctx.textStyles as unknown[]).length > 0) ||
        (ctx.registeredStyles && typeof ctx.registeredStyles === 'object'));
    if (!hasTokens) {
      const workflow = (result as Record<string, unknown>)._workflow as Record<string, unknown>;
      workflow.localTokensEmpty = true;
      workflow.description =
        'Local mode — no local variables or styles found. ' +
        'Create with intentional design choices. Token binding will be skipped.';
      (workflow.designPreflight as Record<string, unknown>).colorRules =
        'No local color tokens available. Choose colors intentionally: ' +
        '1 dominant + 1 accent, total ≤ 5. Do not hardcode random hex values.';
      (workflow.designPreflight as Record<string, unknown>).typographyRules =
        'No local text styles available. Choose fonts intentionally: ' + 'clear heading/body distinction, ≤ 3 weights.';
    }
  }

  // Add connectivity info to response
  const response: Record<string, unknown> = {
    connected: true,
    latency: pingLatency,
    ...(versionWarning ? { versionWarning } : {}),
    ...(result as Record<string, unknown>),
  };

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
