/**
 * Help tool — AI can query tool usage and best practices at runtime.
 *
 * Generated help data comes from the schema compiler.
 * Falls back gracefully if _help.ts hasn't been generated yet.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

let resolveHelp: ((topic?: string) => string) | null = null;

// Lazy-load generated help (may not exist yet during development)
try {
  const helpModule = await import('./_help.js');
  resolveHelp = helpModule.resolveHelp;
} catch {
  // _help.ts not yet generated — tool will return a fallback message
}

export function registerHelpTool(server: McpServer): void {
  server.tool(
    'help',
    'Look up tool documentation. Without topic: list all tools grouped by toolset. ' +
      'With topic: get details for a specific tool or endpoint method (e.g. "nodes", "nodes.get").',
    {
      topic: z
        .string()
        .optional()
        .describe(
          'Tool name, endpoint name, or "endpoint.method" for method details. ' +
            'Omit to get the full tool directory.',
        ),
    },
    async ({ topic }) => {
      if (!resolveHelp) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Help database not available. Run "npm run schema" to generate it.',
            },
          ],
        };
      }

      const text = resolveHelp(topic);
      return {
        content: [{ type: 'text' as const, text }],
      };
    },
  );
}
