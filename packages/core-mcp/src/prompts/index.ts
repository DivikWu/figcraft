/**
 * MCP Prompts — guided workflows for common tasks.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadRules(filename: string): string {
  try {
    return readFileSync(join(__dirname, filename), 'utf-8');
  } catch {
    return '';
  }
}

const DESIGN_GUARDIAN_RULES = loadRules('design-guardian.md');
const DESIGN_CREATOR_RULES = loadRules('design-creator.md');

// Note: Prompt templates currently use flat tool names (e.g. get_node_info, patch_nodes).
// In endpoint mode (FIGCRAFT_API_MODE=endpoint), these map to endpoint methods:
//   get_node_info → nodes(method: "get")
//   search_nodes → nodes(method: "list")
//   patch_nodes → nodes(method: "update")
//   delete_nodes → nodes(method: "delete")
//   create_text → text(method: "create")
//   create_frame → shapes(method: "create_frame")
// The flat tool names are retained for Phase 1 backward compatibility.

export function registerPrompts(server: McpServer): void {
  server.prompt(
    'sync-tokens',
    'Guide: Sync DTCG design tokens to Figma variables and styles.',
    () => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Help me sync design tokens to Figma. Follow these steps:
1. Ask for the DTCG JSON file path
2. Call load_toolset({ names: "tokens" }) to enable token tools
3. Use list_tokens to preview what will be synced
4. Use diff_tokens to check current state vs DTCG
5. Use sync_tokens to push changes
6. Report the sync result (created/updated/skipped/failed)

If there are composite tokens (typography, shadow), explain that they become Figma Styles (not Variables).`,
        },
      }],
    }),
  );

  server.prompt(
    'lint-page',
    'Guide: Lint the current Figma page for design compliance.',
    () => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Help me check the current page for design compliance. Follow these steps in sequence without stopping:
1. Use ping to verify plugin connection
2. Use lint_fix_all to check and auto-fix violations in one step
3. Summarize: total checked / violations found / auto-fixed / remaining
4. For remaining violations, explain what needs manual attention`,
        },
      }],
    }),
  );

  server.prompt(
    'compare-spec',
    'Guide: Compare Figma Library variables with DTCG spec tokens.',
    () => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Help me compare my Figma variables against the DTCG spec. Follow these steps:
1. Ask for the DTCG JSON file path
2. Call load_toolset({ names: "tokens" }) to enable token tools
3. Use diff_tokens to compare
4. Categorize differences: in-sync, dtcg-ahead, figma-ahead, missing
5. Recommend actions for each category
6. Ask if I want to sync to resolve differences`,
        },
      }],
    }),
  );

  server.prompt(
    'auto-fix',
    'Guide: Auto-fix all fixable lint violations on the current page.',
    () => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Help me auto-fix design violations. Follow these steps:
1. Call load_toolset({ names: "lint" }) to enable granular lint tools
2. Run lint_check on the current page/selection
3. Show summary of violations
4. Filter to only autoFixable violations
5. Confirm with me before applying fixes
6. Run lint_fix with the fixable violations
7. Re-run lint_check to verify fixes were applied
8. Report any remaining violations that need manual attention`,
        },
      }],
    }),
  );

  server.prompt(
    'generate-element',
    'Guide: Generate a design element with high design quality. Applies Design Guardian rules (with library) or Design Creator rules (without library).',
    () => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Help me create a design element with high design quality. Follow the Think → Gather → Propose → Confirm → Query → Create → Check workflow:

## Think
1. Call get_mode to verify plugin connection and get designContext (includes libraryComponents if available)
3. Based on the result, determine which mode you are in:
   - If selectedLibrary is set → Design Guardian mode (use "generate-element-library" prompt for rules)
   - If no selectedLibrary → Design Creator mode (use "generate-element-creator" prompt for rules)

## Gather
3. Collect key preferences from the user in ONE message. Check what the user already provided, and ask ONLY for what's missing.
   Match the user's language. Present as a short checklist, not a wall of text.

   --- IF selectedLibrary is set (Design Guardian mode) ---
   Ask for (skip any already answered):
   a. **UI type** — if not clear from the request (e.g. "design a page" is vague; "login page" is clear). Provide 3–4 examples.
   b. **Platform** — Web, iOS, or Android? (affects touch targets, safe areas, conventions)
   Language/region can be inferred from the user's message language — no need to ask unless ambiguous.

   --- IF no selectedLibrary (Design Creator mode) ---
   Ask for (skip any already answered):
   a. **UI type** — if not clear from the request. Provide 3–4 examples.
   b. **Platform** — Web, iOS, or Android?
   c. **Style tone** — provide 4–5 options: Minimal / Elegant / Warm / Bold / Rich (or let user describe freely)
   Language/region can be inferred from the user's message language — no need to ask unless ambiguous.

   MERGE SHORTCUT: If ALL items are already clear from the user's request, skip Gather entirely and go directly to Propose.
   Language/region can be inferred from the user's message language if not explicitly stated — no need to ask.
   **STOP and wait for answers.** Then proceed to Propose.

## Propose
4. Based on the gathered preferences, output a concrete design plan draft.

Start the draft by stating your understanding of the context:
> "I understand you need [what], for [audience/platform], with a [tone] feel."
This gives the user a chance to correct any wrong assumptions before you detail the plan.

Apply the mode-specific design rules from the appropriate prompt (generate-element-library or generate-element-creator).

5. End the proposal with: "Want me to adjust anything, or should I go ahead?"
6. **STOP HERE.** Wait for the user to approve or request changes.

## Confirm
7. If the user requests changes, revise the plan and present again. If approved, proceed.

## Query (library mode with components)
8. For local components, call list_component_properties to discover available variants.
   For library components (only have key from get_mode), use the description field to understand usage,
   or create a temporary instance with create_instance to inspect its componentProperties.
   Skip this step entirely in Design Creator mode (no library selected).

## Create
9. Call get_current_page (maxDepth=1) to understand existing page structure
10. For complete screens, prefer create_screen over raw create_document
   - create_screen is the progressive path: shell first, then sections, then final scoped lint/fix
   - In create_screen section specs, use marginHorizontal / marginLeft / marginRight when a filled child needs real outer margins; FigCraft will wrap it in a transparent inset frame automatically
   - Use create_document directly for smaller inserts or one-off subtree creation
11. If you use create_document for layout structure:
   - Treat it as the raw tree path, not the default full-screen workflow
   - Prefer shell-first / section-first trees over one giant undifferentiated hierarchy
   - Add semantic role on major frames when possible: screen, header, hero, nav, content, list, row, stats, card, form, field, input, button, footer, actions, social_row, system_bar
   - Explicit roles and marginHorizontal / marginLeft / marginRight now use the same shared normalization rules as create_screen
   - With library: auto-bind tokens. Use create_instance (with correct variant properties from Query step) for matching components.
   - Without library: apply your design plan choices
   - Leave autoLint enabled unless you explicitly need raw creation output
12. If create_document cannot express certain details (e.g. asymmetric padding), follow up with patch_nodes immediately.

## Check
13. Self-Review against Layout rules — verify:
    - No empty Spacer frames (use semantic groups with itemSpacing)
    - Responsive children use layoutAlign: STRETCH (inputs, buttons, dividers, content sections)
    - Filled elements with margin use a transparent wrapper frame (not padding on the element itself)
    - System bars (iOS/Android status bar) are full-bleed: page-level paddingLeft/Right/Top = 0, primaryAxisAlignItems = MIN
    - Mobile screen dimensions: iOS 402×874, Android 412×915 (no legacy sizes)
    - All buttons are proper auto-layout frames with centered text, explicit height (≥44pt iOS / ≥48dp Android), and internal padding — no bare text nodes, no overlapping decorative shapes
    - No text overflow or truncation anywhere — every text node fits within its parent container
    - All input fields are auto-layout frames with stroke (border), corner radius, internal padding, and placeholder text child — set layoutAlign: STRETCH
    - Social login / icon buttons are auto-layout frames (HORIZONTAL) with icon + text children, wide enough to show all content without clipping
    - Every frame has a descriptive name reflecting its purpose (e.g. "Login Form", "Email Input") — no "Frame 1" defaults
    Fix violations immediately with patch_nodes.
14. Run lint_fix_all to verify compliance and auto-fix remaining issues.`,
        },
      }],
    }),
  );

  server.prompt(
    'generate-element-library',
    'Design Guardian rules for Library mode. Use when selectedLibrary is set.',
    () => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Apply these Design Guardian rules for the design plan and creation:

${DESIGN_GUARDIAN_RULES}

Draft must include: layout structure, which library tokens to use (colors, typography, spacing),
which library components to reuse from the libraryComponents list,
composition strategy (focal point, visual hierarchy), elevation approach (shadow levels),
icon style (outline/filled/duotone), and content strategy (realistic text examples).

Note: If designContext.unresolvedDefaults is present, those roles have no matching variable in the library.
The agent should choose colors freely for those roles rather than expecting auto-bind to work.`,
        },
      }],
    }),
  );

  server.prompt(
    'generate-element-creator',
    'Design Creator rules for no-library mode. Use when no selectedLibrary is set.',
    () => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Apply these Design Creator rules for the design plan and creation:

${DESIGN_CREATOR_RULES}

Draft must include: purpose, platform (Web/iOS/Android), density, tone, color palette (dominant + accent with hex values),
font pairing, spacing base unit, corner radius scale, composition strategy (focal point, visual hierarchy),
elevation scale (shadow levels), icon style (outline/filled/duotone), content strategy (realistic text examples), and layout structure.
Make intentional choices — do NOT default to Inter + blue + centered without justification.

Note: In Design Creator mode, frames without an explicit fill will be transparent (no auto-bind).
Always specify fill for frames that need a visible background.`,
        },
      }],
    }),
  );

  server.prompt(
    'prototype-flow',
    'Guide: Analyze prototype interactions and generate flow documentation.',
    () => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Help me analyze the prototype flow in this Figma file. Follow these steps:
1. Call load_toolset({ names: "annotations" }) to enable prototype analysis tools
2. Use analyze_prototype_flow to scan the current page (format: "all")
3. Present the summary: total screens, interactions, entry points, dead ends, loops
4. Show the Mermaid flow diagram
5. Highlight any issues:
   - Dead ends (screens with no way out)
   - Missing back navigation
   - Loops that might trap users
   - Screens with only one trigger type (consider adding hover/keyboard alternatives)
6. If requested, output the full Markdown documentation
7. Suggest improvements to the prototype flow`,
        },
      }],
    }),
  );

  server.prompt(
    'document-components',
    'Guide: Generate documentation for all components on the current page.',
    () => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Help me generate documentation for the components in this Figma file. Follow these steps:

1. Call load_toolset({ names: "components-advanced" }) to enable component audit tools
2. Use audit_components to scan all components on the current page
3. For each component, use get_component and list_component_properties to get full details
4. Generate a structured documentation entry for each component:

   ## ComponentName
   **Description:** (from component description, or "No description")
   **Dimensions:** W × H
   **Properties:**
   | Name | Type | Default | Options |
   |------|------|---------|---------|
   | ... | BOOLEAN/TEXT/VARIANT/INSTANCE_SWAP | ... | (variant options if applicable) |

   **Usage:** Brief guidance on when/how to use this component
   **Variants:** List variant combinations if it's a component set

5. Flag any issues found during audit (missing descriptions, unexposed text, etc.)
6. Output the complete documentation in Markdown format
7. Suggest improvements to component structure based on audit findings`,
        },
      }],
    }),
  );

  server.prompt(
    'review-design',
    'Guide: Review existing Figma designs against design quality rules. Outputs structured violation report with fixes.',
    () => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Help me review the design quality of existing Figma elements. Execute ALL steps in sequence without stopping:

1. Call ping to verify plugin connection
2. Call get_mode to determine the current mode and selected library
3. Use get_selection to get selected nodes, or fall back to get_current_page (maxDepth=2) children
4. Use get_node_info on each target node to read properties (fills, fontSize, fontName, spacing, dimensions, cornerRadius, etc.)

5. Apply the appropriate design rules based on mode:

--- IF selectedLibrary is set (Design Guardian rules) ---
Use the "generate-element-library" prompt to load Design Guardian rules.

Review focus:
- Are colors/fonts bound to library tokens? Flag hardcoded values when tokens exist.
- Are gradients/shadows refined or cheap-looking?
- Is there a clear visual hierarchy and focal point?
- Is composition intentional (asymmetry where appropriate, no uniform grids)?
- Is spacing consistent and using library tokens (or 8dp multiples)?
- Are text contents realistic and contextually appropriate (not placeholder)?
- Are icons consistent in style (outline/filled/duotone not mixed)?
- Are shadow levels consistent and within ≤ 3 tiers?
- Does the node structure complexity match the design tone?
- Are accessibility standards met?

--- IF no selectedLibrary (Design Creator rules) ---
Use the "generate-element-creator" prompt to load Design Creator rules.

Review focus:
- Is there a clear design intent (not just AI defaults)?
- Do color choices serve a purpose?
- Are fonts chosen with intention (not just Inter)?
- Is spacing rhythmic, consistent, and based on a clear base unit?
- Is there a clear visual focal point? Is composition intentional (not just centered symmetry)?
- Are text contents realistic and contextually appropriate (not placeholder)?
- Are icons consistent in style (outline/filled/duotone not mixed)?
- Are shadow levels consistent and within ≤ 3 tiers?
- Does the node structure complexity match the design tone?
- Are accessibility standards met?

6. Output a structured report for each violation:
   - violation: quote the specific node, property, and value
   - why: one sentence explaining why this is a problem
   - fix: concrete fix suggestion with MCP tool call example

7. Summarize: X passed / Y violations / Z auto-fixable
8. Run lint_fix_all to auto-fix what's possible, then report remaining violations`,
        },
      }],
    }),
  );
}
