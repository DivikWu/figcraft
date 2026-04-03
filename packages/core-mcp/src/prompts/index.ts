/**
 * MCP Prompts — guided workflows for common tasks.
 *
 * Prompt content lives in content/prompts/*.yaml (source of truth).
 * Build step (npm run content) compiles YAML → _prompts.ts.
 * This file only handles registration and runtime substitution.
 */

import { getPreventionChecklist } from '@figcraft/quality-engine';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PROMPT_DEFINITIONS } from './_prompts.js';

// Design rules live in skills/ as independent SKILL.md files (ui-ux-fundamentals, design-guardian, design-creator).
// Loaded on-demand via get_design_guidelines tool (in mode.ts).
// Build copies stripped content to dist/ for published artifact.

export function registerPrompts(server: McpServer): void {
  // Runtime substitution for dynamic placeholders
  const preventionCount = getPreventionChecklist({
    phases: ['layout', 'structure', 'content'],
    minSeverity: 'style',
  }).length;
  const substitutions: Record<string, string> = {
    '{{PREVENTION_CHECKLIST_COUNT}}': String(preventionCount),
  };

  for (const def of PROMPT_DEFINITIONS) {
    // Apply runtime substitutions
    let steps = def.steps;
    for (const [placeholder, value] of Object.entries(substitutions)) {
      steps = steps.replaceAll(placeholder, value);
    }

    server.prompt(def.name, def.description, () => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: steps,
          },
        },
      ],
    }));
  }
}
