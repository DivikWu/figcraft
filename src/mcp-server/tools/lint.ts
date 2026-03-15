/**
 * Lint tools — MCP wrappers for check, fix, and rules.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';

export function registerLintTools(server: McpServer, bridge: Bridge): void {
  server.tool(
    'lint_check',
    'Run design lint rules on selected nodes or the current page. ' +
      'Checks colors, typography, spacing, border radius against tokens, ' +
      'and WCAG contrast/target-size compliance.',
    {
      nodeIds: z.array(z.string()).optional().describe('Node IDs to lint (default: selection or page)'),
      rules: z.array(z.string()).optional().describe('Rule names to run (default: all)'),
      offset: z.number().optional().describe('Pagination offset'),
      limit: z.number().optional().describe('Pagination limit'),
      annotate: z.boolean().optional().describe('Add annotations to violated nodes in Figma'),
      useStoredTokens: z.string().optional().describe('Name of cached token set to use'),
    },
    async ({ nodeIds, rules, offset, limit, annotate, useStoredTokens }) => {
      // Load cached tokens if requested
      let tokenContext: Record<string, unknown> | undefined;
      if (useStoredTokens) {
        const cached = await bridge.request('load_spec_tokens', { name: useStoredTokens }) as {
          tokens?: Array<{ path: string; type: string; value: unknown }>;
          error?: string;
        };
        if (cached.tokens) {
          tokenContext = buildTokenContext(cached.tokens);
        }
      }

      const result = await bridge.request('lint_check', {
        nodeIds,
        rules,
        offset,
        limit,
        annotate,
        tokenContext,
      });

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    'lint_fix',
    'Auto-fix lint violations that are marked as autoFixable. ' +
      'Pass the violations array from a lint_check result.',
    {
      violations: z.array(z.object({
        nodeId: z.string(),
        nodeName: z.string(),
        rule: z.string(),
        currentValue: z.unknown(),
        expectedValue: z.unknown().optional(),
        suggestion: z.string(),
        autoFixable: z.boolean(),
        fixData: z.record(z.unknown()).optional(),
      })).describe('Violations to fix (from lint_check result)'),
    },
    async ({ violations }) => {
      const fixable = violations.filter((v) => v.autoFixable);
      const result = await bridge.request('lint_fix', { violations: fixable });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    'lint_rules',
    'List all available lint rules with descriptions.',
    {},
    async () => {
      const result = await bridge.request('lint_rules', {});
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    'clear_annotations',
    'Remove all figcraft lint annotations from specified nodes or the whole page.',
    {
      nodeIds: z.array(z.string()).optional().describe('Node IDs to clear (default: all on page)'),
    },
    async ({ nodeIds }) => {
      const result = await bridge.request('clear_annotations', { nodeIds });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}

function buildTokenContext(tokens: Array<{ path: string; type: string; value: unknown }>): Record<string, unknown> {
  const colorTokens: Record<string, string> = {};
  const spacingTokens: Record<string, number> = {};
  const radiusTokens: Record<string, number> = {};
  const typographyTokens: Record<string, unknown> = {};

  for (const t of tokens) {
    const name = t.path.replace(/\./g, '/');
    switch (t.type) {
      case 'color':
        if (typeof t.value === 'string') colorTokens[name] = t.value;
        break;
      case 'dimension':
      case 'number': {
        const num = typeof t.value === 'number' ? t.value : parseFloat(String(t.value));
        if (t.path.includes('spacing') || t.path.includes('gap') || t.path.includes('padding')) {
          spacingTokens[name] = num;
        } else if (t.path.includes('radius') || t.path.includes('corner')) {
          radiusTokens[name] = num;
        }
        break;
      }
      case 'typography':
        typographyTokens[name] = t.value;
        break;
    }
  }

  return { colorTokens, spacingTokens, radiusTokens, typographyTokens, variableIds: {} };
}
