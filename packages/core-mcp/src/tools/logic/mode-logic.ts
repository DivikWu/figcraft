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
      const summary = {
        componentSets: grouped.componentSets.map((cs) => {
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
          return {
            key: cs.key,
            name: cs.name,
            description: cs.description,
            // Library page/section name — critical for disambiguating components with similar property names
            // (e.g., Avatar vs Input both have "Placeholder"/"Size" but live in different sections)
            containingFrame: cs.containingFrame,
            variantCount: cs.variants.length,
            // Property names with all possible values — enables direct variant selection without extra search calls
            propertyOptions,
          };
        }),
        standalone: grouped.standalone,
        _note:
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

  // Structured workflow instructions — the single source of truth for all IDEs.
  // Replaces the old _hint with actionable, enforceable steps.
  const hasLibrary = !!result.selectedLibrary;
  const isLocal = result.selectedLibrary === '__local__';
  (result as Record<string, unknown>)._workflow = {
    mode: hasLibrary ? 'design-guardian' : 'design-creator',
    description: isLocal
      ? 'Local mode — using variables and styles from the current file. Bind to local tokens when available; create freely when not.'
      : hasLibrary
        ? 'Library mode — use library tokens and components. Exercise restraint, match existing patterns.'
        : 'Creator mode — no library. Make intentional design choices, avoid AI defaults (blue/gray/Inter).',

    // ⛔ BLOCKING: must complete before ANY write tool call
    designPreflight: {
      required: true,
      instruction:
        'Classify task scale FIRST, then complete the required checklist items. ' +
        'Present a design proposal to the user and WAIT for explicit confirmation. ' +
        'Do NOT call create_frame/create_text/create_svg until user approves.',
      scaleClassification: {
        instruction: 'Classify the task into one of these scales. This determines which checklist items are required:',
        scales: {
          element:
            'Single element (button, card, input). Required: purpose + colorRules + typographyRules. ' +
            'Skip platform/language/density/tone unless user mentions them. ' +
            'If existing screens are on the page, inherit their conventions.',
          screen: 'Single screen (login, dashboard, settings). Required: ALL checklist items.',
          flow: 'Multi-screen flow (3+ screens). Required: ALL checklist items + get_creation_guide(topic:"multi-screen").',
        },
      },
      checklist: {
        purpose: 'What problem does this solve? Who is the audience?',
        platform:
          'iOS (402×874) / Android (412×915) / Web? Determines touch targets and conventions. ' +
          '(Required for screen/flow scale. Element scale: inherit from existing page context.)',
        language:
          'What language for UI text? Determines font choice and content. ' +
          'Primary font MUST match language × platform (e.g. Chinese + iOS → PingFang SC, not SF Pro). ' +
          'Refer to platform skill typography table after platform is confirmed. ' +
          '(Required for screen/flow scale. Element scale: inherit from existing page context.)',
        density:
          'Sparse form vs dense dashboard — how much info per screen? ' + '(Required for screen/flow scale only.)',
        tone:
          'Minimal ← Elegant ← Warm → Bold → Maximal — pick a clear position. ' +
          '(Required for screen/flow scale only.)',
      },
      colorRules: hasLibrary
        ? '⛔ MANDATORY: Use fillVariableName/strokeVariableName with variable names from designContext.defaults. NEVER pass fill:"#hex" when a matching library token exists. For defaults entries that are null (listed in unresolvedDefaults), call search_design_system to find alternatives.' +
          (bridge.libraryFallbackDecisions?.fillsUsed?.length
            ? ` (Fallback consistency: prior screens used hardcoded colors ${bridge.libraryFallbackDecisions.fillsUsed.join(', ')} where no token matched — reuse these for visual consistency.)`
            : '')
        : bridge.designDecisions?.fillsUsed?.length
          ? `Established palette: ${bridge.designDecisions.fillsUsed.join(', ')}. Use these colors for consistency. Add new colors only if design requires it.`
          : '1 dominant + 1 accent, total ≤ 5. Dominant at 60%+. NEVER default to blue/gray without justification.',
      typographyRules: hasLibrary
        ? 'Use library text styles. Clear heading/body distinction via existing style tiers.' +
          (bridge.libraryFallbackDecisions?.fontsUsed?.length
            ? ` (Fallback consistency: prior screens used fonts ${bridge.libraryFallbackDecisions.fontsUsed.join(', ')} where no text style matched — reuse these.)`
            : '')
        : bridge.designDecisions?.fontsUsed?.length
          ? `Established fonts: ${bridge.designDecisions.fontsUsed.join(', ')}. Continue using these. Add new fonts only if justified.`
          : 'Clear heading/body distinction (different weight or size). ≤ 3 font weights. NEVER use only Inter without justification. Primary font MUST match the language from checklist (e.g. Chinese → PingFang SC on iOS, not SF Pro).',
      contentRules:
        'Realistic, contextually appropriate text. NEVER use "Lorem ipsum", "Text goes here", "Button", "Title".',
      iconRules: hasLibrary
        ? 'Library icon components first (search_design_system), Iconify fallback. Single style, never text placeholders. MUST call get_creation_guide(topic:"iconography") before placing any icons.'
        : 'Single icon set + style per design. icon_search → icon_create with index for ordering. Never text placeholders. MUST call get_creation_guide(topic:"iconography") before placing any icons.',
      antiSlop: 'No cheap gradients/glow effects. Vary corner radius across hierarchy. Prefer asymmetry over symmetry.',
      // Dynamic: accumulated design decisions from prior create_frame calls (creator mode only)
      ...(!hasLibrary && bridge.designDecisions
        ? {
            establishedPalette: bridge.designDecisions,
            ...(bridge.designDecisions.radiusValues?.length
              ? {
                  spacingRules: `Established radius: ${bridge.designDecisions.radiusValues.join(', ')}px. Spacing: ${bridge.designDecisions.spacingValues?.join(', ') || 'not yet established'}px.`,
                }
              : {}),
          }
        : {}),
    },

    // After user confirms the design proposal:
    creationSteps: [
      hasLibrary
        ? '⛔ LIBRARY TOKEN BINDING: Use designContext.defaults for color bindings — pass fillVariableName/strokeVariableName (NOT fill/strokeColor hex). ' +
          'Example: defaults["bg/primary"] → fillVariableName:"bg/primary". ' +
          'If a defaults entry is null (listed in unresolvedDefaults), call search_design_system to find the closest token. ' +
          'Only use hardcoded hex as last resort when no matching token exists anywhere in the library.'
        : null,
      hasLibrary
        ? '⛔ LIBRARY COMPONENT INSTANCES: ' +
          '1) Check libraryComponents from this response — it lists all component sets (name, key, containingFrame, propertyNames) and standalone components. Use this as your starting inventory. ' +
          '2) For components you plan to use, call search_design_system(query) to get variant details and confirm keys. Build a Component Map before creating: ' +
          'e.g. Button → key:"abc", variants: Type=Primary/Secondary; Input → setKey:"def", variants: Size=md/lg, State=Default/Error. ' +
          '3) Use type:"instance" in children[]: ' +
          'componentSetKey + variantProperties selects a variant from a set (e.g. variantProperties:{Type:"Primary",Size:"Large"}); ' +
          'componentKey imports a single component; ' +
          'properties sets instance overrides AFTER creation (text labels, boolean toggles — e.g. properties:{Label:"Sign In"}). ' +
          'componentId is for local components only (node ID). ' +
          'DISAMBIGUATION: Property names like "Placeholder" and "Size" appear on MANY component types (Avatar, Input, Card). ' +
          'Always check containingFrame to verify the component category (e.g., "Forms" vs "Avatars"). ' +
          'For form inputs, look for State/Error/Focused variants — Avatars never have these.'
        : null,
      'Page context is included above in pageContext (isEmpty, childCount, topFrameNames). If you need deeper detail (node styles, nested tree), call get_current_page(maxDepth=2).',
      'After platform confirmed: load platform-specific rules via get_creation_guide(topic:"platform-ios") / get_creation_guide(topic:"platform-android") / get_creation_guide(topic:"responsive"). These provide safe areas, typography, navigation patterns, and touch targets specific to the target platform.',
      'Classify task scale: single element / single screen / multi-screen (3-5) / large flow (6+).',
      'Use create_frame + children (declarative) for all creation. children support optional index field for insertion order. type:"rectangle" for simple shapes (dividers, spacers), type:"frame" for containers with children/auto-layout. For text range styling: text(method:"set_range"). For grouping: group_nodes (requires load_toolset("shapes-vectors")). For complex layouts, call get_creation_guide(topic:"layout") for structural rules.',
      '⚠️ SIZING: Root screen frames MUST include layoutSizingHorizontal:"FIXED" + layoutSizingVertical:"FIXED" explicitly. Without this, Opinion Engine infers HUG and the frame collapses to content size.',
      '⚠️ PLACEHOLDERS: Use type:"frame" (not "rectangle") for any container that needs children later (logos, avatars, chart areas). Rectangles cannot have children. Add layoutMode:"HORIZONTAL", primaryAxisAlignItems:"CENTER", counterAxisAlignItems:"CENTER" to center content inside.',
      hasLibrary
        ? '⚠️ ICONS: Plan all icons before create_frame. Use search_design_system(query:"icon chevron") to find library icon components first; fall back to icon_search + icon_create. ' +
          'ORDERING: icon_create with parentId appends to END by default — use index:0 to place icon BEFORE text (left side in HORIZONTAL layout). children array order = visual order in auto-layout. ' +
          'NEVER use text characters as icon placeholders (">" for chevron, "..." for more). ' +
          'MUST call get_creation_guide(topic:"iconography") before placing any icons.'
        : '⚠️ ICONS: Plan all icons before create_frame (navigation chevrons, social logos, action icons). Call icon_search to find icons, then icon_create with parentId + index to place correctly. ' +
          'ORDERING: icon_create appends to END by default — use index:0 to place icon BEFORE text (left side in HORIZONTAL layout). children array order = visual order in auto-layout. ' +
          'NEVER use text characters as icon placeholders (">" for chevron, "..." for more). ' +
          'MUST call get_creation_guide(topic:"iconography") before placing any icons.',
      'nodes update: ordered execution (simple props → fills/strokes → layout sizing → resize → text). Supports width/height directly, text properties, layoutPositioning. Safe to send layoutMode + width in same patch.',
      'For complex or ambiguous parameters, use dryRun:true first to preview Opinion Engine inferences before committing.',
      'After the FIRST create_frame failure, review ALL remaining planned payloads for the same pattern before retrying.',
      'Verify each create_frame response: check _children structure. Use export_image(scale:0.5) for visual verification when needed.',
      'lint_fix_all on completed screens (supports dryRun:true to preview). If remaining violations include severity:"error", read the details and fix manually before replying.',
    ].filter(Boolean),

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
      iconography: 'get_creation_guide(topic:"iconography") — icon ordering, sizing, tool chain, design rules',
      designRules: 'get_design_guidelines(category) — aesthetic design direction rules',
      libraryImportToolset:
        'load_toolset("library-import") — for importing library variables/styles into local file (design system authoring). NOT needed for UI creation in library mode — core tools suffice.',
    },

    // How search_design_system behaves in this mode
    searchBehavior: hasLibrary
      ? result.selectedLibrary === '__local__'
        ? "MANDATORY for token discovery beyond designContext.defaults. search_design_system searches local variables and styles. Call it when defaults doesn't cover all needed colors or when you need component IDs."
        : 'MANDATORY for token discovery beyond designContext.defaults. search_design_system searches local + library components via REST API. Call it when defaults doesn\'t cover all needed colors or when you need component IDs for type:"instance".'
      : 'search_design_system is disabled (no library selected). Skip it — make intentional design choices directly.',

    // What to do RIGHT NOW (next action for AI)
    nextAction: hasLibrary
      ? 'Reply to user: gather missing preferences (platform, language, density, tone) OR present design proposal based on available library tokens/components if user provided enough detail. WAIT for confirmation.'
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
        'Local mode (empty) — no local variables or styles found in this file. ' +
        'Behaves like creator mode: make intentional design choices. Token binding will be skipped. ' +
        'To use a shared library instead, call set_mode with a library name.';
      (workflow.designPreflight as Record<string, unknown>).colorRules =
        'No local color tokens available. Choose colors intentionally: ' +
        '1 dominant + 1 accent, total ≤ 5. Do not hardcode random hex values.';
      (workflow.designPreflight as Record<string, unknown>).typographyRules =
        'No local text styles available. Choose fonts intentionally: ' + 'clear heading/body distinction, ≤ 3 weights.';
    }
  }

  // Inject migration context if switching from creator → library mode
  if (hasLibrary) {
    const migration = bridge.consumeMigrationContext();
    if (migration) {
      const workflow = (result as Record<string, unknown>)._workflow as Record<string, unknown>;
      workflow.migrationContext = {
        description:
          'Migrated from creator mode. The following design choices were established in prior screens. ' +
          'Use search_design_system to find the closest library tokens for each, and maintain visual consistency.',
        priorColors: migration.fillsUsed,
        priorFonts: migration.fontsUsed,
        priorRadius: migration.radiusValues,
        priorSpacing: migration.spacingValues,
      };
    }
  }

  // Add connectivity info to response
  const response: Record<string, unknown> = {
    connected: true,
    latency: pingLatency,
    ...(versionWarning ? { versionWarning } : {}),
    ...(pageContext ? { pageContext } : {}),
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
