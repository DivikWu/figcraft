/**
 * MCP Prompts — guided workflows for common tasks.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

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
    'Guide: Generate a design element using tokens from the spec.',
    () => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Help me create a design element that follows the design spec. Follow these steps:
1. Ask what element to create (button, card, input, badge, avatar)
2. Check get_mode — if library mode, try to find a library component first
3. If library component exists, use create_instance
4. If not, create from tokens: use create_frame with auto layout, apply token colors and typography
5. Ensure all values use variables/styles, not hardcoded values
6. Run lint_check on the created element to verify compliance`,
        },
      }],
    }),
  );
}
