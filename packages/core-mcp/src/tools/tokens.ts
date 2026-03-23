/**
 * Token tools — list, sync, diff DTCG tokens against Figma.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';
import { parseDtcgFile } from '../dtcg.js';
import type { DesignToken } from '@figcraft/shared';

/** Build a nested DTCG object from flat token entries. */
function buildDtcgTree(
  entries: Array<{ path: string; type: string; value: unknown; description?: string }>,
): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const entry of entries) {
    const parts = entry.path.split('.');
    let current = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current)) current[parts[i]] = {};
      current = current[parts[i]] as Record<string, unknown>;
    }
    const leaf: Record<string, unknown> = {
      $value: entry.value,
      $type: entry.type,
    };
    if (entry.description) leaf.$description = entry.description;
    current[parts[parts.length - 1]] = leaf;
  }
  return root;
}

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
    'sync_tokens_multi_mode',
    'Sync DTCG tokens from multiple files into different modes of the same collection. ' +
      'Each entry maps a mode name to a DTCG file path. ' +
      'Modes are created automatically if they don\'t exist. ' +
      'Example: { "Light": "tokens-light.json", "Dark": "tokens-dark.json" }',
    {
      modes: z.record(z.string()).describe('Map of mode name → DTCG file path'),
      collectionName: z.string().optional().describe('Collection name (default: "Design Tokens")'),
    },
    async ({ modes, collectionName }) => {
      const colName = collectionName ?? 'Design Tokens';
      const modeEntries = Object.entries(modes);

      // Parse all files first
      const parsed = new Map<string, Awaited<ReturnType<typeof parseDtcgFile>>>();
      for (const [modeName, filePath] of modeEntries) {
        parsed.set(modeName, await parseDtcgFile(filePath));
      }

      // Ensure collection and modes exist
      const setupResult = await bridge.request('ensure_collection_modes', {
        collectionName: colName,
        modeNames: modeEntries.map(([name]) => name),
      }) as { collectionId: string; modes: Array<{ modeId: string; name: string }> };

      const results: Record<string, { variables: unknown; styles: unknown; totalTokens: number }> = {};

      for (const [modeName, tokens] of parsed) {
        const modeInfo = setupResult.modes.find((m) => m.name === modeName);
        if (!modeInfo) continue;

        const atomicTokens = tokens.filter((t) => t.type !== 'typography' && t.type !== 'shadow');
        const compositeTokens = tokens.filter((t) => t.type === 'typography' || t.type === 'shadow');

        const varResult = await bridge.request('sync_tokens', {
          tokens: atomicTokens,
          collectionName: colName,
          modeName,
        });

        let styleResult = { created: 0, updated: 0, skipped: 0, failed: 0, failures: [] };
        if (compositeTokens.length > 0) {
          styleResult = await bridge.request('sync_styles', { tokens: compositeTokens }) as typeof styleResult;
        }

        results[modeName] = {
          variables: varResult,
          styles: styleResult,
          totalTokens: tokens.length,
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            collectionId: setupResult.collectionId,
            modes: setupResult.modes,
            results,
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

  server.tool(
    'reverse_sync_tokens',
    'Export Figma variables to a DTCG JSON file (reverse sync). ' +
      'Reads all variables from Figma, converts to W3C DTCG format with nested groups, ' +
      'and writes to the specified file path. Aliases are preserved as {path} references.',
    {
      filePath: z.string().describe('Output file path for DTCG JSON'),
      collectionId: z.string().optional().describe('Export only this collection. Omit for all.'),
      modeName: z.string().optional().describe('Mode to export values from (default: first mode)'),
    },
    async ({ filePath, collectionId, modeName }) => {
      // Get variables from Figma
      const exported = await bridge.request('export_variables', { collectionId }) as {
        count: number;
        variables: Array<{
          path: string;
          type: string;
          valuesByMode: Record<string, unknown>;
          description?: string;
          scopes?: string[];
          aliasOf?: Record<string, string>;
        }>;
      };

      // Pick the right mode's value for each variable
      const entries: Array<{ path: string; type: string; value: unknown; description?: string }> = [];
      for (const v of exported.variables) {
        const modeNames = Object.keys(v.valuesByMode);
        const targetMode = modeName ?? modeNames[0];
        const value = v.valuesByMode[targetMode] ?? v.valuesByMode[modeNames[0]];
        entries.push({
          path: v.path,
          type: v.type,
          value,
          description: v.description,
        });
      }

      // Build nested DTCG tree and write
      const tree = buildDtcgTree(entries);
      const { writeFile, mkdir } = await import('fs/promises');
      const { dirname } = await import('path');
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, JSON.stringify(tree, null, 2), 'utf-8');

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            ok: true,
            filePath,
            tokenCount: entries.length,
          }, null, 2),
        }],
      };
    },
  );
}
