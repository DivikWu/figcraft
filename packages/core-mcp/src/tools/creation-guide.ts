/**
 * Creation guide — structural knowledge for UI creation across all IDEs.
 *
 * Centralizes layout rules, multi-screen architecture, batching strategy,
 * tool behavior patterns, and Opinion Engine documentation that were
 * previously scattered across IDE-specific files (CLAUDE.md, AGENTS.md,
 * .kiro/steering/).
 *
 * This is the single MCP-accessible source for these rules, ensuring
 * Cursor, Antigravity, Codex, and any other IDE gets the same guidance
 * as Claude Code and Kiro.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getPreventionChecklist } from '@figcraft/quality-engine';
import { GUIDES } from './_guides.js';
import { UI_PATTERNS } from './_templates.js';
import type { UiPattern } from './_templates.js';

// Guide aliases — keys generated from content/guides/*.md filenames
const MULTI_SCREEN_GUIDE = GUIDES.MULTI_SCREEN;
const BATCHING_GUIDE = GUIDES.BATCHING;
const TOOL_BEHAVIOR_GUIDE = GUIDES.TOOL_BEHAVIOR;
const RESPONSIVE_GUIDE = GUIDES.RESPONSIVE;
const CONTENT_STATES_GUIDE = GUIDES.CONTENT_STATES;
const OPINION_ENGINE_GUIDE = GUIDES.OPINION_ENGINE;

// ─── UI Type Templates ───
// (Templates extracted to content/templates/*.yaml — see scripts/compile-content.ts)
// (Guides extracted to content/guides/*.md)

// REMOVED: UiPattern interface and UI_PATTERNS object (now in _templates.ts)
// Marker for sed removal:
function formatUiPattern(uiType: string, pattern: UiPattern): string {
  const lines: string[] = [
    `# UI Pattern: ${uiType}`,
    '',
    '## Structure',
    '```',
    pattern.structure,
    '```',
    '',
    '## Key Decisions',
  ];
  for (const [key, value] of Object.entries(pattern.keyDecisions)) {
    lines.push(`- **${key}**: ${value}`);
  }
  lines.push('', '## Common Pitfalls (prevent these)');
  for (const pitfall of pattern.pitfalls) {
    lines.push(`- ${pitfall}`);
  }
  lines.push('', '## Tone Variants');
  for (const [tone, props] of Object.entries(pattern.toneVariants)) {
    lines.push(`### ${tone.charAt(0).toUpperCase() + tone.slice(1)}`);
    for (const [prop, value] of Object.entries(props)) {
      lines.push(`- ${prop}: ${value}`);
    }
  }
  lines.push('', '## Example Parameters (minimal tone)', '');
  lines.push('Ready-to-use `create_frame` params skeleton. Customize text, colors, and icons after creation.');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(pattern.exampleParams, null, 2));
  lines.push('```');
  return lines.join('\n');
}

// ─── Tool registration ───

const VALID_UI_TYPES = Object.keys(UI_PATTERNS);

export function registerCreationGuide(server: McpServer): void {
  server.tool(
    'get_creation_guide',
    'Get structural creation guidance by topic. Returns layout rules, multi-screen architecture, ' +
      'batching strategy, tool behavior patterns, Opinion Engine documentation, or UI type-specific ' +
      'templates with structure, key decisions, pitfalls, and tone variants. ' +
      'Use before creating complex UI to understand best practices.',
    {
      topic: z.enum(['layout', 'multi-screen', 'batching', 'tool-behavior', 'opinion-engine', 'ui-patterns', 'responsive', 'content-states'])
        .describe('Topic: layout (structural rules), multi-screen (flow architecture), batching (context budget), tool-behavior (usage patterns), opinion-engine (auto-inference docs), ui-patterns (UI type templates — requires uiType), responsive (web breakpoints + auto-layout), content-states (empty/loading/error patterns)'),
      uiType: z.string().optional()
        .describe(`UI type for ui-patterns topic. Available: ${VALID_UI_TYPES.join(', ')}. Omit to list all available types.`),
    },
    async ({ topic, uiType }) => {
      let content: string;

      switch (topic) {
        case 'layout':
          content = '# Layout & Structure Rules\n\n' +
            getPreventionChecklist({ phases: ['layout', 'structure'], minSeverity: 'style' })
              .map((hint, i) => `${i + 1}. ${hint}`)
              .join('\n');
          break;
        case 'multi-screen':
          content = MULTI_SCREEN_GUIDE;
          break;
        case 'batching':
          content = BATCHING_GUIDE;
          break;
        case 'tool-behavior':
          content = TOOL_BEHAVIOR_GUIDE;
          break;
        case 'opinion-engine':
          content = OPINION_ENGINE_GUIDE;
          break;
        case 'responsive':
          content = RESPONSIVE_GUIDE;
          break;
        case 'content-states':
          content = CONTENT_STATES_GUIDE;
          break;
        case 'ui-patterns': {
          if (!uiType) {
            content = '# Available UI Patterns\n\n' +
              VALID_UI_TYPES.map(t => `- **${t}**: ${UI_PATTERNS[t].keyDecisions.layout?.slice(0, 80) ?? ''}`).join('\n') +
              '\n\nUse get_creation_guide(topic: "ui-patterns", uiType: "<type>") for the full template.';
            break;
          }
          const pattern = UI_PATTERNS[uiType];
          if (!pattern) {
            content = `Unknown UI type "${uiType}". Available: ${VALID_UI_TYPES.join(', ')}`;
            break;
          }
          content = formatUiPattern(uiType, pattern);
          break;
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: content,
        }],
      };
    },
  );
}
