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

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPreventionChecklist } from '@figcraft/quality-engine';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { GUIDES } from './_guides.js';
import type { UiPattern } from './_templates.js';
import { UI_PATTERNS } from './_templates.js';

// ─── Skill-sourced guides (source of truth: skills/*/SKILL.md) ───
// Same pattern as mode.ts design rule loading: read from skills/ at startup,
// fallback to co-located .md in dist/ for packaged environments.

const SECTIONS_TO_STRIP = ['Skill Boundaries', 'Design Direction', 'On-Demand Guide'];

/** Remove YAML frontmatter (--- ... ---) from skill content */
const stripFrontmatter = (content: string): string => content.replace(/^---[\s\S]*?---\s*/, '');

/** Remove IDE-only sections (Skill Boundaries, Design Direction, On-Demand Guide) */
function stripSkillSections(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let skipping = false;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      const heading = line.replace(/^## /, '').trim();
      skipping = SECTIONS_TO_STRIP.includes(heading);
      if (skipping) continue;
    }
    if (!skipping) result.push(line);
  }
  return result
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Load a creation guide from skill (source of truth) or fallback .md */
function loadSkillGuide(skillsDir: string, useSkills: boolean, skillName: string, fallbackFilename: string): string {
  try {
    if (useSkills) {
      const raw = readFileSync(join(skillsDir, skillName, 'SKILL.md'), 'utf-8');
      return stripSkillSections(stripFrontmatter(raw));
    }
    return readFileSync(join(dirname(fileURLToPath(import.meta.url)), fallbackFilename), 'utf-8');
  } catch {
    return '';
  }
}

// Resolve skills directory (same path logic as mode.ts)
const selfDir = dirname(fileURLToPath(import.meta.url));
const skillsDir = join(selfDir, '..', '..', '..', '..', 'skills');
const useSkills = existsSync(join(skillsDir, 'multi-screen-flow', 'SKILL.md'));

// Skill-sourced guides (loaded once at startup)
const MULTI_SCREEN_GUIDE = loadSkillGuide(skillsDir, useSkills, 'multi-screen-flow', 'multi-screen.md');
const RESPONSIVE_GUIDE = loadSkillGuide(skillsDir, useSkills, 'responsive-design', 'responsive.md');
const CONTENT_STATES_GUIDE = loadSkillGuide(skillsDir, useSkills, 'content-states', 'content-states.md');
const ICONOGRAPHY_GUIDE = loadSkillGuide(skillsDir, useSkills, 'iconography', 'iconography.md');
const PLATFORM_IOS_GUIDE = loadSkillGuide(skillsDir, useSkills, 'platform-ios', 'platform-ios.md');
const PLATFORM_ANDROID_GUIDE = loadSkillGuide(skillsDir, useSkills, 'platform-android', 'platform-android.md');

// Compiled guides (source of truth: content/guides/*.md → _guides.ts)
const BATCHING_GUIDE = GUIDES.BATCHING;
const TOOL_BEHAVIOR_GUIDE = GUIDES.TOOL_BEHAVIOR;
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
      topic: z
        .enum([
          'layout',
          'multi-screen',
          'batching',
          'tool-behavior',
          'opinion-engine',
          'ui-patterns',
          'responsive',
          'content-states',
          'iconography',
          'platform-ios',
          'platform-android',
        ])
        .describe(
          'Topic: layout (structural rules), multi-screen (flow architecture), batching (context budget), tool-behavior (usage patterns), opinion-engine (auto-inference docs), ui-patterns (UI type templates — requires uiType), responsive (web breakpoints + auto-layout), content-states (empty/loading/error patterns), iconography (icon ordering, sizing, tool chain, design rules), platform-ios (iOS safe areas, SF Pro, HIG conventions), platform-android (Material Design 3, Roboto, navigation)',
        ),
      uiType: z
        .string()
        .optional()
        .describe(
          `UI type for ui-patterns topic. Available: ${VALID_UI_TYPES.join(', ')}. Omit to list all available types.`,
        ),
    },
    async ({ topic, uiType }) => {
      let content: string;

      switch (topic) {
        case 'layout':
          content =
            '# Layout & Structure Rules\n\n' +
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
        case 'iconography':
          content = ICONOGRAPHY_GUIDE;
          break;
        case 'platform-ios':
          content = PLATFORM_IOS_GUIDE;
          break;
        case 'platform-android':
          content = PLATFORM_ANDROID_GUIDE;
          break;
        case 'ui-patterns': {
          if (!uiType) {
            content =
              '# Available UI Patterns\n\n' +
              VALID_UI_TYPES.map((t) => `- **${t}**: ${UI_PATTERNS[t].keyDecisions.layout?.slice(0, 80) ?? ''}`).join(
                '\n',
              ) +
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
        content: [
          {
            type: 'text' as const,
            text: content,
          },
        ],
      };
    },
  );
}
