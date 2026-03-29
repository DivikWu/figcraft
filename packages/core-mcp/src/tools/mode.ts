/**
 * Mode tools — get/set operation mode (library vs spec).
 *
 * Mode source of truth lives in the Figma Plugin's clientStorage.
 * MCP Server round-trips to the plugin via bridge for every get/set.
 */

import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';
import { getModeLogic } from './logic/mode-logic.js';

export function registerModeTools(server: McpServer, bridge: Bridge): void {
  // Load design rules from markdown files
  const promptsDir = join(dirname(fileURLToPath(import.meta.url)), 'prompts');
  const loadRules = (filename: string): string => {
    try { return readFileSync(join(promptsDir, filename), 'utf-8'); } catch { return ''; }
  };
  const guardianRules = loadRules('design-guardian.md');
  const creatorRules = loadRules('design-creator.md');

  server.tool(
    'get_mode',
    'Get current mode, selected library, design context, and library components. ' +
      'Also verifies plugin connectivity (built-in ping). ' +
      'IMPORTANT: Call this before creating elements to get available design tokens and components. ' +
      'Returns { connected, mode, selectedLibrary, designContext, libraryComponents? }. ' +
      'designContext contains grouped tokens (text/surface/fill/border) and defaults mapping. ' +
      'libraryComponents (when library file URL is configured) lists component sets with variants grouped by set, plus standalone components.',
    {},
    async () => {
      return getModeLogic(bridge);
    },
  );

  server.tool(
    'set_mode',
    'Switch operation mode between "library" (Figma shared library) ' +
      'and "spec" (DTCG design spec documents). Also updates the Plugin UI toggle. ' +
      'In library mode, optionally specify which library to use.',
    {
      mode: z.enum(['library', 'spec']).describe('Operation mode to switch to'),
      library: z.string().optional().describe('Library name to use in library mode (from list_library_collections libraryName). Use "__local__" to select current file local styles/variables.'),
    },
    async ({ mode, library }) => {
      const params: Record<string, unknown> = { mode };
      if (library !== undefined) params.library = library;
      const result = await bridge.request('set_mode', params) as { mode: string; selectedLibrary: string | null };
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            mode: result.mode,
            description: result.mode === 'library'
              ? 'Using Figma shared library as token source. Lint checks variable/style bindings.'
              : 'Using DTCG spec documents as token source. Lint checks against DTCG token values.',
          }, null, 2),
        }],
      };
    },
  );

  server.tool(
    'get_design_guidelines',
    'Get design quality guidelines for the current mode. Returns Design Guardian rules (library mode) ' +
      'or Design Creator rules (no library). Use this to understand design best practices before creating elements. ' +
      'Optionally specify a category to get focused rules.',
    {
      category: z.enum(['all', 'color', 'typography', 'spacing', 'layout', 'composition', 'content', 'accessibility', 'buttons', 'inputs'])
        .optional()
        .describe('Rule category to return (default: "all")'),
    },
    async ({ category = 'all' }) => {
      // Determine current mode
      let mode = 'library';
      let library: string | null = null;
      try {
        const modeResult = await bridge.request('get_mode', {}) as { mode: string; selectedLibrary: string | null };
        mode = modeResult.mode;
        library = modeResult.selectedLibrary;
      } catch { /* default to library mode */ }

      const isLibraryMode = mode === 'library' && !!library;
      const rules = isLibraryMode ? guardianRules : creatorRules;
      const ruleName = isLibraryMode ? 'Design Guardian (Library Mode)' : 'Design Creator (No Library)';

      if (category === 'all') {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              mode: ruleName,
              selectedLibrary: library,
              guidelines: rules,
            }, null, 2),
          }],
        };
      }

      // Extract specific category section from markdown
      const categoryMap: Record<string, string[]> = {
        color: ['## Color', '## Spec Priority'],
        typography: ['## Typography'],
        spacing: ['## Spacing'],
        layout: ['## Layout'],
        composition: ['## Composition'],
        content: ['## Content'],
        accessibility: ['## Accessibility'],
        buttons: ['## Buttons', '## Buttons & Interactive Elements'],
        inputs: ['## Input Fields'],
      };

      // Categories that were moved to steering files (layout, buttons, inputs)
      // return a helpful redirect message instead of "not found"
      const movedCategories: Record<string, string> = {
        layout: 'Layout rules are enforced by the Quality Engine lint system. Run lint_fix_all to auto-check.',
        buttons: 'Button structure rules are enforced by the Quality Engine lint system. Run lint_fix_all to auto-check.',
        inputs: 'Input field rules are enforced by the Quality Engine lint system. Run lint_fix_all to auto-check.',
      };

      if (movedCategories[category]) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              mode: ruleName,
              selectedLibrary: library,
              category,
              guidelines: movedCategories[category],
            }, null, 2),
          }],
        };
      }

      const headings = categoryMap[category] ?? [];
      const sections: string[] = [];
      for (const heading of headings) {
        const idx = rules.indexOf(heading);
        if (idx === -1) continue;
        const nextHeading = rules.indexOf('\n## ', idx + heading.length);
        sections.push(rules.slice(idx, nextHeading === -1 ? undefined : nextHeading).trim());
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            mode: ruleName,
            selectedLibrary: library,
            category,
            guidelines: sections.length > 0 ? sections.join('\n\n') : `No "${category}" section found in ${ruleName} rules.`,
          }, null, 2),
        }],
      };
    },
  );
}
