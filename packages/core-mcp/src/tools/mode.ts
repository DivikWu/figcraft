/**
 * Mode tools — get/set operation mode (library vs spec).
 *
 * Mode source of truth lives in the Figma Plugin's clientStorage.
 * MCP Server round-trips to the plugin via bridge for every get/set.
 */

import { z } from 'zod';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';
import { getModeLogic } from './logic/mode-logic.js';

// ─── Category extraction (pre-computed at module load time) ───

const CATEGORY_HEADINGS: Record<string, string[]> = {
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

const MOVED_CATEGORIES: Record<string, string> = {
  layout: 'Layout rules are enforced by the Quality Engine lint system. Run lint_fix_all to auto-check.',
  buttons: 'Button structure rules are enforced by the Quality Engine lint system. Run lint_fix_all to auto-check.',
  inputs: 'Input field rules are enforced by the Quality Engine lint system. Run lint_fix_all to auto-check.',
};

/** Extract category sections from a combined rules string. */
function extractCategory(rules: string, category: string): string | null {
  const headings = CATEGORY_HEADINGS[category] ?? [];
  const sections: string[] = [];
  for (const heading of headings) {
    const idx = rules.indexOf(heading);
    if (idx === -1) continue;
    const nextHeading = rules.indexOf('\n## ', idx + heading.length);
    sections.push(rules.slice(idx, nextHeading === -1 ? undefined : nextHeading).trim());
  }
  return sections.length > 0 ? sections.join('\n\n') : null;
}

/** Pre-compute category sections for a given rules string. */
function buildCategoryCache(rules: string): Map<string, string> {
  const cache = new Map<string, string>();
  for (const category of Object.keys(CATEGORY_HEADINGS)) {
    if (MOVED_CATEGORIES[category]) continue; // Skip moved categories
    const content = extractCategory(rules, category);
    if (content) cache.set(category, content);
  }
  return cache;
}

export function registerModeTools(server: McpServer, bridge: Bridge): void {
  // Load design rules from skills/ (source of truth) or fallback to co-located .md (built artifact)
  const selfDir = dirname(fileURLToPath(import.meta.url));
  const skillsDir = join(selfDir, '..', '..', '..', '..', 'skills');
  const useSkills = existsSync(join(skillsDir, 'ui-ux-fundamentals', 'SKILL.md'));

  const stripFrontmatter = (content: string): string =>
    content.replace(/^---[\s\S]*?---\s*/, '');

  const loadRules = (skillName: string, fallbackFilename: string): string => {
    try {
      if (useSkills) {
        return stripFrontmatter(readFileSync(join(skillsDir, skillName, 'SKILL.md'), 'utf-8'));
      }
      return readFileSync(join(selfDir, fallbackFilename), 'utf-8');
    } catch { return ''; }
  };
  const fundamentalsRules = loadRules('ui-ux-fundamentals', 'ui-ux-fundamentals.md');
  const guardianRules = loadRules('design-guardian', 'design-guardian.md');
  const creatorRules = loadRules('design-creator', 'design-creator.md');

  // Pre-compute category sections for both modes (avoids re-parsing on every call)
  const guardianFull = fundamentalsRules + '\n\n---\n\n' + guardianRules;
  const creatorFull = fundamentalsRules + '\n\n---\n\n' + creatorRules;
  const guardianCategoryCache = buildCategoryCache(guardianFull);
  const creatorCategoryCache = buildCategoryCache(creatorFull);

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
      // Reset modeQueried to force get_mode call for fresh workflow/designContext
      bridge.modeQueried = false;
      bridge.selectedLibrary = result.selectedLibrary;
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            mode: result.mode,
            selectedLibrary: result.selectedLibrary,
            description: result.mode === 'library'
              ? 'Using Figma shared library as token source. Lint checks variable/style bindings.'
              : 'Using DTCG spec documents as token source. Lint checks against DTCG token values.',
            _nextAction: 'Call get_mode to load design context, tokens, and workflow instructions for the new mode.',
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
      // Use cached library state from bridge (set by get_mode/set_mode) to avoid extra round-trip
      const library = bridge.selectedLibrary;
      const isLibraryMode = library !== null && library !== undefined;
      const rules = isLibraryMode ? guardianFull : creatorFull;
      const categoryCache = isLibraryMode ? guardianCategoryCache : creatorCategoryCache;
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

      // Moved categories redirect to lint system
      if (MOVED_CATEGORIES[category]) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              mode: ruleName,
              selectedLibrary: library,
              category,
              guidelines: MOVED_CATEGORIES[category],
            }, null, 2),
          }],
        };
      }

      // Serve from pre-computed cache (no re-parsing on each call)
      const cached = categoryCache.get(category);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            mode: ruleName,
            selectedLibrary: library,
            category,
            guidelines: cached ?? `No "${category}" section found in ${ruleName} rules.`,
          }, null, 2),
        }],
      };
    },
  );
}
