/**
 * Pure function that builds the _workflow object for get_mode responses.
 *
 * Extracted from getModeLogic() so the workflow construction logic can be
 * unit-tested independently without a live Bridge/Relay connection.
 *
 * All inputs are plain data — no Bridge or async dependencies.
 */

import type { DesignDecisions } from '../../design-session.js';

/** Inputs needed to build the workflow object. */
export interface WorkflowInput {
  selectedLibrary: string | null | undefined;
  designDecisions: DesignDecisions | null;
  libraryFallbackDecisions: DesignDecisions | null;
  /** designContext from get_mode plugin response */
  designContext: Record<string, unknown> | null;
  /** localComponents from list_local_components (only for __local__ mode) */
  localComponents: Record<string, unknown> | undefined;
  /** Migration context consumed from DesignSession (creator → library switch) */
  migrationContext: DesignDecisions | null;
}

/** Build the structured _workflow object — the single source of truth for all IDEs. */
export function buildWorkflow(input: WorkflowInput): Record<string, unknown> {
  const { selectedLibrary, designDecisions, libraryFallbackDecisions, migrationContext } = input;
  const hasLibrary = !!selectedLibrary;
  const isLocal = selectedLibrary === '__local__';

  const workflow: Record<string, unknown> = {
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
          (libraryFallbackDecisions?.fillsUsed?.length
            ? ` (Fallback consistency: prior screens used hardcoded colors ${libraryFallbackDecisions.fillsUsed.join(', ')} where no token matched — reuse these for visual consistency.)`
            : '')
        : designDecisions?.fillsUsed?.length
          ? `Established palette: ${designDecisions.fillsUsed.join(', ')}. Use these colors for consistency. Add new colors only if design requires it.`
          : '1 dominant + 1 accent, total ≤ 5. Dominant at 60%+. NEVER default to blue/gray without justification.',
      typographyRules: hasLibrary
        ? 'Use library text styles. Clear heading/body distinction via existing style tiers.' +
          (libraryFallbackDecisions?.fontsUsed?.length
            ? ` (Fallback consistency: prior screens used fonts ${libraryFallbackDecisions.fontsUsed.join(', ')} where no text style matched — reuse these.)`
            : '')
        : designDecisions?.fontsUsed?.length
          ? `Established fonts: ${designDecisions.fontsUsed.join(', ')}. Continue using these. Add new fonts only if justified.`
          : 'Clear heading/body distinction (different weight or size). ≤ 3 font weights. NEVER use only Inter without justification. Primary font MUST match the language from checklist (e.g. Chinese → PingFang SC on iOS, not SF Pro).',
      contentRules:
        'Realistic, contextually appropriate text. NEVER use "Lorem ipsum", "Text goes here", "Button", "Title".',
      iconRules: hasLibrary
        ? 'Library icon components first (search_design_system), Iconify fallback. Single style, never text placeholders. MUST call get_creation_guide(topic:"iconography") before placing any icons.'
        : 'Single icon set + style per design. icon_search → icon_create with index for ordering. Never text placeholders. MUST call get_creation_guide(topic:"iconography") before placing any icons.',
      antiSlop: 'No cheap gradients/glow effects. Vary corner radius across hierarchy. Prefer asymmetry over symmetry.',
      // Dynamic: accumulated design decisions from prior create_frame calls (creator mode only)
      ...(!hasLibrary && designDecisions
        ? {
            establishedPalette: designDecisions,
            ...(designDecisions.radiusValues?.length
              ? {
                  spacingRules: `Established radius: ${designDecisions.radiusValues.join(', ')}px. Spacing: ${designDecisions.spacingValues?.join(', ') || 'not yet established'}px.`,
                }
              : {}),
          }
        : {}),
    },

    // Library spec priority (from design-guardian core rules — avoids requiring skill load for common tasks)
    ...(hasLibrary
      ? {
          specPriority: [
            'MUST use component instances (type:"instance") when a matching component exists in libraryComponents; hand-built frame+text is only acceptable when no match.',
            'MUST match colors/fonts/spacing to library Variable/Style first; skip binding only when no match exists.',
            'Check containingFrame to verify component category — property names like "Placeholder"/"Size" appear across unrelated types.',
          ],
        }
      : {}),

    // After user confirms the design proposal:
    creationSteps: [
      // Token binding (Library + Local with tokens)
      hasLibrary
        ? '⛔ TOKEN BINDING: Use designContext.defaults for color bindings — pass fillVariableName/strokeVariableName. ' +
          'unresolvedDefaults lists roles with no matching token — call search_design_system for these. ' +
          'Text nodes auto-bind textColor when no fill specified. Only hardcode hex as last resort.'
        : null,
      // Component instances (Library vs Local vs Creator)
      isLocal
        ? '⛔ LOCAL COMPONENT INSTANCES: ' +
          'localComponents lists component sets (id, name, containingFrame, propertyOptions with all variant values) and standalone components. ' +
          'Use type:"instance" + componentId + variantProperties in children[]. ' +
          'properties sets overrides AFTER creation (text labels, toggles). ' +
          'search_design_system(query) for on-demand discovery beyond the summary. ' +
          'DISAMBIGUATION: Check containingFrame to verify category (e.g., "Forms" vs "Avatars").'
        : hasLibrary
          ? '⛔ COMPONENT INSTANCES: libraryComponents lists component sets with key, containingFrame, and propertyOptions (all variant values). ' +
            'Use type:"instance" + componentSetKey + variantProperties in children[]. ' +
            'properties sets overrides AFTER creation (text labels, toggles). ' +
            'DISAMBIGUATION: Check containingFrame to verify category (e.g., "Forms" vs "Avatars"). ' +
            'Call search_design_system only for components NOT in libraryComponents.'
          : null,
      'Use create_frame + children (declarative) for all creation. children support optional index field for insertion order. type:"rectangle" for simple shapes (dividers, spacers), type:"frame" for containers with children/auto-layout. For text range styling: text(method:"set_range"). For grouping: group_nodes (requires load_toolset("shapes-vectors")). For complex layouts, call get_creation_guide(topic:"layout") for structural rules.',
      '⚠️ SIZING: Root screen frames MUST include layoutSizingHorizontal:"FIXED" + layoutSizingVertical:"FIXED" explicitly. Without this, Opinion Engine infers HUG and the frame collapses to content size.',
      '⚠️ PLACEHOLDERS: Use type:"frame" (not "rectangle") for any container that needs children later (logos, avatars, chart areas). Rectangles cannot have children. Add layoutMode:"HORIZONTAL", primaryAxisAlignItems:"CENTER", counterAxisAlignItems:"CENTER" to center content inside.',
      hasLibrary
        ? `⚠️ ICONS: Plan all icons before create_frame. Use search_design_system(query:"icon chevron") to find ${isLocal ? 'local' : 'library'} icon components first; fall back to icon_search + icon_create. ` +
          'ORDERING: children array order = visual order in auto-layout. icon_create with parentId appends to END — use index:0 to place icon BEFORE text. ' +
          'NEVER use text characters as icon placeholders (">" for chevron, "..." for more).'
        : '⚠️ ICONS: Plan all icons before create_frame. icon_search → icon_create with parentId + index. ' +
          'ORDERING: children array order = visual order in auto-layout. icon_create appends to END — use index:0 to place icon BEFORE text. ' +
          'NEVER use text characters as icon placeholders (">" for chevron, "..." for more).',
      'nodes(method:"update"): ordered execution (simple props → fills/strokes → layout sizing → resize → text). Supports width/height directly, text properties, layoutPositioning.',
      'System auto-verifies root-level creations: check _qualityScore and _qualityWarning in create_frame response. If score < 80 or errors exist, call verify_design() to fix. System tracks verification debt — _verificationDebt reminders appear until verified.',
      'lint_fix_all clears verification debt for the page (supports dryRun:true to preview). If remaining violations include severity:"error", read the details and fix manually before replying.',
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
      ? selectedLibrary === '__local__'
        ? "MANDATORY for token discovery beyond designContext.defaults. search_design_system searches local variables and styles. Call it when defaults doesn't cover all needed colors or when you need component IDs."
        : 'MANDATORY for token discovery beyond designContext.defaults. search_design_system searches local + library components via REST API. Call it when defaults doesn\'t cover all needed colors or when you need component IDs for type:"instance".'
      : 'search_design_system is disabled (no library selected). Skip it — make intentional design choices directly.',

    // What to do RIGHT NOW (next action for AI)
    nextAction: hasLibrary
      ? 'Reply to user: gather missing preferences (platform, language, density, tone) OR present design proposal based on available library tokens/components if user provided enough detail. WAIT for confirmation.'
      : 'Reply to user: gather missing preferences (platform, style tone, color palette) OR present design proposal if user provided enough detail. WAIT for confirmation.',
  };

  // ── Sparse local tokens/components detection (__local__ mode) ──
  if (selectedLibrary === '__local__') {
    applySparseLocalFallback(workflow, input);
  }

  // ── Migration context (creator → library) ──
  if (hasLibrary && migrationContext) {
    workflow.migrationContext = {
      description:
        'Migrated from creator mode. The following design choices were established in prior screens. ' +
        'Use search_design_system to find the closest library tokens for each, and maintain visual consistency.',
      priorColors: migrationContext.fillsUsed,
      priorFonts: migrationContext.fontsUsed,
      priorRadius: migrationContext.radiusValues,
      priorSpacing: migrationContext.spacingValues,
    };
  }

  return workflow;
}

/**
 * When __local__ mode has no tokens, downgrade workflow to creator-mode rules.
 * Mutates the workflow object in place.
 */
function applySparseLocalFallback(workflow: Record<string, unknown>, input: WorkflowInput): void {
  const ctx = input.designContext;
  const hasTokens =
    ctx &&
    ((Array.isArray(ctx.colorVariables) && (ctx.colorVariables as unknown[]).length > 0) ||
      (Array.isArray(ctx.textStyles) && (ctx.textStyles as unknown[]).length > 0) ||
      (ctx.registeredStyles && typeof ctx.registeredStyles === 'object'));
  const localComps = input.localComponents;
  const hasComponents =
    localComps &&
    ((Array.isArray(localComps.componentSets) && (localComps.componentSets as unknown[]).length > 0) ||
      (Array.isArray(localComps.standalone) && (localComps.standalone as unknown[]).length > 0));

  if (hasTokens) return; // tokens exist — no fallback needed

  workflow.localTokensEmpty = true;
  workflow.description =
    'Local mode (empty) — no local variables or styles found in this file. ' +
    'Behaves like creator mode: make intentional design choices. Token binding will be skipped. ' +
    'To use a shared library instead, call set_mode with a library name.';
  const preflight = workflow.designPreflight as Record<string, unknown>;
  preflight.colorRules =
    'No local color tokens available. Choose colors intentionally: ' +
    '1 dominant + 1 accent, total ≤ 5. Do not hardcode random hex values.';
  preflight.typographyRules =
    'No local text styles available. Choose fonts intentionally: ' + 'clear heading/body distinction, ≤ 3 weights.';
  preflight.iconRules =
    'No local icon components. Use icon_search + icon_create for all icons. ' +
    'Single icon set + style per design. Never text placeholders. ' +
    'MUST call get_creation_guide(topic:"iconography") before placing any icons.';

  // Remove token binding and component instance steps
  const steps = workflow.creationSteps as (string | null)[];
  steps[0] = null; // Remove token binding — no tokens available
  if (!hasComponents) {
    steps[1] = null; // Remove component instance step — no local components either
  }
  workflow.creationSteps = steps.filter(Boolean);

  workflow.searchBehavior = hasComponents
    ? 'No local tokens, but local components exist. search_design_system can discover components. ' +
      'For colors and typography, make intentional design choices directly.'
    : 'No local tokens or components — search_design_system will return empty results. ' +
      'Make intentional design choices directly.';
}
