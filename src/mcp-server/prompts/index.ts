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
2. Use list_tokens to preview what will be synced
3. Use diff_tokens to check current state vs DTCG
4. Use sync_tokens to push changes
5. Report the sync result (created/updated/skipped/failed)

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
          text: `Help me check the current page for design compliance. Follow these steps:
1. Use get_mode to check current mode (library vs spec)
2. Use lint_rules to show available rules
3. Use lint_check on the current selection or page
4. Summarize violations by category
5. For auto-fixable violations, ask if I want to run lint_fix
6. Optionally annotate violations in Figma (annotate=true)`,
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
2. Use diff_tokens to compare
3. Categorize differences: in-sync, dtcg-ahead, figma-ahead, missing
4. Recommend actions for each category
5. Ask if I want to sync to resolve differences`,
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
1. Run lint_check on the current page/selection
2. Show summary of violations
3. Filter to only autoFixable violations
4. Confirm with me before applying fixes
5. Run lint_fix with the fixable violations
6. Re-run lint_check to verify fixes were applied
7. Report any remaining violations that need manual attention`,
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
          text: `Help me create a design element with high design quality. Follow these steps:

1. Ask what element to create (button, card, input, badge, avatar, page section, etc.)
2. Call get_mode to check mode and get designContext

--- IF selectedLibrary is set (Design Guardian mode) ---

Apply these design rules:
${DESIGN_GUARDIAN_RULES}

3. If a matching component exists in the library, use create_instance
4. Otherwise, create from tokens:
   - create_frame and create_text will auto-bind library tokens when fill is not specified
   - For non-default tokens, use designContext to find the right variable
   - Workflow: import_library_variable(key) → set_variable_binding(nodeId, field, variableId)
5. Create the element
6. Self-Review: check the created element against every MUST/NEVER rule above. For each violation, fix it immediately (patch_nodes or recreate). Output a brief review summary.
7. Run lint_check to verify compliance

--- IF no selectedLibrary (Design Creator mode) ---

Apply these design rules:
${DESIGN_CREATOR_RULES}

3. Complete the Design Thinking exercise BEFORE creating anything. Share your Purpose, Tone, and key design decisions with the user.
4. Based on your Tone choice, decide: color palette (dominant + accent), font pairing (heading + body), spacing base unit, and corner radius scale.
5. Create the element using your design decisions
6. Self-Review: check the created element against every MUST/NEVER rule above. For each violation, fix it immediately. Output a brief review summary.
7. Run lint_check to verify accessibility (contrast, touch targets)`,
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
1. Use analyze_prototype_flow to scan the current page (format: "all")
2. Present the summary: total screens, interactions, entry points, dead ends, loops
3. Show the Mermaid flow diagram
4. Highlight any issues:
   - Dead ends (screens with no way out)
   - Missing back navigation
   - Loops that might trap users
   - Screens with only one trigger type (consider adding hover/keyboard alternatives)
5. If requested, output the full Markdown documentation
6. Suggest improvements to the prototype flow`,
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

1. Use audit_components to scan all components on the current page
2. For each component, use get_component and list_component_properties to get full details
3. Generate a structured documentation entry for each component:

   ## ComponentName
   **Description:** (from component description, or "No description")
   **Dimensions:** W × H
   **Properties:**
   | Name | Type | Default | Options |
   |------|------|---------|---------|
   | ... | BOOLEAN/TEXT/VARIANT/INSTANCE_SWAP | ... | (variant options if applicable) |

   **Usage:** Brief guidance on when/how to use this component
   **Variants:** List variant combinations if it's a component set

4. Flag any issues found during audit (missing descriptions, unexposed text, etc.)
5. Output the complete documentation in Markdown format
6. Suggest improvements to component structure based on audit findings`,
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
          text: `Help me review the design quality of existing Figma elements. Follow these steps:

1. Call get_mode to determine the current mode and selected library
2. Use get_selection to get selected nodes, or fall back to get_current_page children
3. Use get_node_info on each target node to read properties (fills, fontSize, fontName, spacing, dimensions, cornerRadius, etc.)

4. Apply the appropriate design rules based on mode:

--- IF selectedLibrary is set (Design Guardian rules) ---
${DESIGN_GUARDIAN_RULES}

Review focus:
- Are colors/fonts bound to library tokens? Flag hardcoded values when tokens exist.
- Are gradients/shadows refined or cheap-looking?
- Is there a clear visual hierarchy?
- Are accessibility standards met?

--- IF no selectedLibrary (Design Creator rules) ---
${DESIGN_CREATOR_RULES}

Review focus:
- Is there a clear design intent (not just AI defaults)?
- Do color choices serve a purpose?
- Are fonts chosen with intention (not just Inter)?
- Is spacing rhythmic and consistent?
- Are accessibility standards met?

5. Output a structured report for each violation:
   - violation: quote the specific node, property, and value
   - why: one sentence explaining why this is a problem
   - fix: concrete fix suggestion with MCP tool call example

6. Summarize: X passed / Y violations / Z auto-fixable
7. Ask if the user wants to auto-fix the fixable items (using patch_nodes or lint_fix)`,
        },
      }],
    }),
  );
}
