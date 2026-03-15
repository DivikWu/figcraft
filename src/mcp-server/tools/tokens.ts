/**
 * Token tools — list, sync, diff DTCG tokens against Figma.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';
import { parseDtcgFile } from '../dtcg.js';
import type { DesignToken } from '../../shared/types.js';

export function registerTokenTools(server: McpServer, bridge: Bridge): void {
  server.tool(
    'list_tokens',
    'Parse a DTCG JSON file and list all design tokens. ' +
      'Resolves aliases and returns flat token list.',
    {
      filePath: z.string().describe('Path to DTCG JSON file'),
      type: z.string().optional().describe('Filter by token type (e.g. "color", "typography")'),
    },
    async ({ filePath, type }) => {
      const tokens = await parseDtcgFile(filePath);
      const filtered = type ? tokens.filter((t) => t.type === type) : tokens;
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ total: tokens.length, showing: filtered.length, tokens: filtered }, null, 2),
        }],
      };
    },
  );

  server.tool(
    'sync_tokens',
    'Sync DTCG tokens to Figma — creates/updates Variables for atomic tokens ' +
      'and Styles for composite types (typography, shadow). Idempotent.',
    {
      filePath: z.string().describe('Path to DTCG JSON file'),
      collectionName: z.string().optional().describe('Figma collection name (default: "Design Tokens")'),
      modeName: z.string().optional().describe('Mode name (default: "Default")'),
    },
    async ({ filePath, collectionName, modeName }) => {
      const allTokens = await parseDtcgFile(filePath);

      // Atomic tokens → Variables
      const atomicTokens = allTokens.filter(
        (t) => t.type !== 'typography' && t.type !== 'shadow',
      );
      const compositeTokens = allTokens.filter(
        (t) => t.type === 'typography' || t.type === 'shadow',
      );

      const varResult = await bridge.request('sync_tokens', {
        tokens: atomicTokens,
        collectionName,
        modeName,
      }) as { created: number; updated: number; skipped: number; failed: number; failures: unknown[] };

      // Composite tokens → Styles
      let styleResult = { created: 0, updated: 0, skipped: 0, failed: 0, failures: [] as unknown[] };
      if (compositeTokens.length > 0) {
        styleResult = await bridge.request('sync_styles', {
          tokens: compositeTokens,
        }) as typeof styleResult;
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            variables: varResult,
            styles: styleResult,
            totalTokens: allTokens.length,
          }, null, 2),
        }],
      };
    },
  );

  server.tool(
    'diff_tokens',
    'Compare DTCG tokens against current Figma variables. ' +
      'Shows which tokens are in-sync, ahead, behind, or missing.',
    {
      filePath: z.string().describe('Path to DTCG JSON file'),
      collectionName: z.string().optional().describe('Collection to compare against'),
    },
    async ({ filePath, collectionName }) => {
      const tokens = await parseDtcgFile(filePath);

      // Get current Figma variables
      const figmaVars = await bridge.request('list_variables', {}) as {
        variables: Array<{ name: string; resolvedType: string; valuesByMode: Record<string, unknown> }>;
      };

      const figmaMap = new Map<string, typeof figmaVars.variables[0]>();
      for (const v of figmaVars.variables) {
        figmaMap.set(v.name, v);
      }

      const diff: Array<{
        path: string;
        status: string;
        dtcgValue?: unknown;
        figmaValue?: unknown;
      }> = [];

      for (const token of tokens) {
        if (token.type === 'typography' || token.type === 'shadow') continue;

        const varName = token.path.replace(/\./g, '/');
        const figmaVar = figmaMap.get(varName);

        if (!figmaVar) {
          diff.push({ path: token.path, status: 'missing-in-figma', dtcgValue: token.value });
        } else {
          // Compare first mode value
          const firstModeValue = Object.values(figmaVar.valuesByMode)[0];
          const match = JSON.stringify(firstModeValue) === JSON.stringify(token.value);
          diff.push({
            path: token.path,
            status: match ? 'in-sync' : 'dtcg-ahead',
            dtcgValue: token.value,
            figmaValue: firstModeValue,
          });
          figmaMap.delete(varName);
        }
      }

      // Remaining figma vars not in DTCG
      for (const [name, v] of figmaMap) {
        diff.push({
          path: name.replace(/\//g, '.'),
          status: 'missing-in-dtcg',
          figmaValue: Object.values(v.valuesByMode)[0],
        });
      }

      const summary = {
        inSync: diff.filter((d) => d.status === 'in-sync').length,
        dtcgAhead: diff.filter((d) => d.status === 'dtcg-ahead').length,
        missingInFigma: diff.filter((d) => d.status === 'missing-in-figma').length,
        missingInDtcg: diff.filter((d) => d.status === 'missing-in-dtcg').length,
      };

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ summary, diff }, null, 2),
        }],
      };
    },
  );
}
