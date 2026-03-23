/**
 * Library style tools — discover and import library styles via Figma REST API.
 *
 * list_library_styles / get_library_style_details: REST API (no bridge needed).
 * import_library_style: bridge → Plugin API (figma.importStyleByKeyAsync).
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';
import {
  fetchLibraryStyles,
  fetchStyleNodeDetails,
} from '../figma-api.js';
import { getToken } from '../auth.js';

export function registerLibraryStyleTools(server: McpServer, bridge: Bridge): void {
  server.tool(
    'list_library_styles',
    'List published styles (TEXT, FILL, EFFECT, GRID) from a Figma library file via REST API. ' +
      'Returns metadata only (name, key, type, description). ' +
      'Use get_library_style_details to fetch full properties. ' +
      'Requires Figma OAuth authentication (run figma_login first).',
    {
      fileKey: z
        .string()
        .describe('Figma file key of the library file (from URL: figma.com/design/<fileKey>/...)'),
      styleType: z
        .enum(['TEXT', 'FILL', 'EFFECT', 'GRID'])
        .optional()
        .describe('Filter by style type. Omit to return all types.'),
    },
    async ({ fileKey, styleType }) => {
      try {
        const token = await getToken();
        const styles = await fetchLibraryStyles(fileKey, token, styleType);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ count: styles.length, styles }, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            { type: 'text' as const, text: err instanceof Error ? err.message : String(err) },
          ],
        };
      }
    },
  );

  server.tool(
    'get_library_style_details',
    'Fetch full properties (font, color, effects) for specific library styles via REST API. ' +
      'Use after list_library_styles. Returns fontSize, fontFamily, fills, effects, etc. ' +
      'Results can be fed to register_library_styles for auto-application.',
    {
      fileKey: z.string().describe('Figma file key'),
      styles: z
        .array(
          z.object({
            key: z.string(),
            file_key: z.string(),
            node_id: z.string(),
            style_type: z.enum(['TEXT', 'FILL', 'EFFECT', 'GRID']),
            name: z.string(),
            description: z.string().optional().default(''),
          }),
        )
        .describe('Style entries from list_library_styles'),
    },
    async ({ fileKey, styles }) => {
      try {
        const token = await getToken();
        const details = await fetchStyleNodeDetails(fileKey, token, styles);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ count: details.length, styles: details }, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            { type: 'text' as const, text: err instanceof Error ? err.message : String(err) },
          ],
        };
      }
    },
  );

  // ─── sync_library_styles: one-step discover → detail → register ───

  server.tool(
    'sync_library_styles',
    'One-step sync: discover all published styles from a Figma library file, fetch their full properties, ' +
      'and register them for auto-application. Combines list_library_styles + get_library_style_details + ' +
      'register_library_styles into a single call. Requires Figma OAuth authentication (run figma_login first).',
    {
      fileKey: z
        .string()
        .describe('Figma file key of the library file (from URL: figma.com/design/<fileKey>/...)'),
      library: z
        .string()
        .describe('Library name for registration (e.g. "YAMI-UI-UX-Guidelines")'),
    },
    async ({ fileKey, library }) => {
      try {
        const token = await getToken();

        // Step 1: Discover all styles
        const allStyles = await fetchLibraryStyles(fileKey, token);

        // Step 2: Fetch details for TEXT, FILL, EFFECT (skip GRID)
        const relevantStyles = allStyles.filter(
          (s) => s.style_type === 'TEXT' || s.style_type === 'FILL' || s.style_type === 'EFFECT',
        );
        const details = await fetchStyleNodeDetails(fileKey, token, relevantStyles);

        // Step 3: Convert to registration format
        const textStyles: Array<{ key: string; name: string; fontSize: number; fontFamily: string; fontWeight: string }> = [];
        const paintStyles: Array<{ key: string; name: string; hex: string }> = [];
        const effectStyles: Array<{ key: string; name: string; effectType: string }> = [];

        for (const d of details) {
          if (d.style_type === 'TEXT') {
            const props = d.properties as { fontFamily: string; fontSize: number; fontWeight: number };
            textStyles.push({
              key: d.key,
              name: d.name,
              fontSize: props.fontSize,
              fontFamily: props.fontFamily,
              fontWeight: fontWeightToString(props.fontWeight),
            });
          } else if (d.style_type === 'FILL') {
            const props = d.properties as { fills: Array<{ type: string; color?: { r: number; g: number; b: number; a: number }; opacity?: number }> };
            const solidFill = props.fills.find((f) => f.type === 'SOLID' && f.color);
            if (solidFill?.color) {
              paintStyles.push({
                key: d.key,
                name: d.name,
                hex: rgbaToHex(solidFill.color),
              });
            }
          } else if (d.style_type === 'EFFECT') {
            const props = d.properties as { effects: Array<{ type: string }> };
            const firstEffect = props.effects[0];
            if (firstEffect) {
              effectStyles.push({
                key: d.key,
                name: d.name,
                effectType: firstEffect.type,
              });
            }
          }
        }

        const freshStyles: RegisteredStyles = { textStyles, paintStyles, effectStyles };

        // Step 4: Fetch previously stored styles and compute diff
        let stored: RegisteredStyles = { textStyles: [], paintStyles: [], effectStyles: [] };
        try {
          const storedRaw = await bridge.request('get_registered_styles', { library });
          if (storedRaw && typeof storedRaw === 'object') {
            stored = storedRaw as RegisteredStyles;
          }
        } catch { /* first sync, no stored data */ }

        const diff = diffStyles(freshStyles, stored);
        const hasChanges = diff.added.length > 0 || diff.removed.length > 0 || diff.modified.length > 0;

        // Step 5: Register — incremental if we have stored data, full otherwise
        let result: unknown;
        if (hasChanges || stored.textStyles.length === 0) {
          // Build changed-only subset (added + modified keys)
          const changedKeys = new Set([
            ...diff.added.map((e) => e.key),
            ...diff.modified.map((e) => e.key),
          ]);
          const changedStyles: RegisteredStyles = {
            textStyles: textStyles.filter((s) => changedKeys.has(s.key)),
            paintStyles: paintStyles.filter((s) => changedKeys.has(s.key)),
            effectStyles: effectStyles.filter((s) => changedKeys.has(s.key)),
          };
          const removedKeys = diff.removed.map((e) => e.key);

          result = await bridge.request('register_library_styles_incremental', {
            library,
            fullStyles: freshStyles,
            changedStyles,
            removedKeys,
          }, 120_000);
        } else {
          result = { ok: true, registered: { textStyles: 0, paintStyles: 0, effectStyles: 0 }, skipped: 'no changes' };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  ok: true,
                  discovered: { total: allStyles.length, text: textStyles.length, fill: paintStyles.length, effect: effectStyles.length },
                  diff: {
                    added: diff.added,
                    removed: diff.removed,
                    modified: diff.modified,
                    unchanged: diff.unchanged,
                  },
                  registered: result,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            { type: 'text' as const, text: err instanceof Error ? err.message : String(err) },
          ],
        };
      }
    },
  );

  server.tool(
    'import_library_style',
    'Import a published library style into the current file by key. ' +
      'Works for TEXT, PAINT, and EFFECT styles. ' +
      'Uses Plugin API figma.importStyleByKeyAsync.',
    {
      styleKey: z.string().describe('The style key (from list_library_styles)'),
    },
    async ({ styleKey }) => {
      try {
        const result = await bridge.request('import_library_style', { styleKey });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            { type: 'text' as const, text: err instanceof Error ? err.message : String(err) },
          ],
        };
      }
    },
  );
}

// ─── Diff ───

interface StyleDiffEntry {
  type: 'text' | 'paint' | 'effect';
  key: string;
  name: string;
}

interface StyleDiffModified extends StyleDiffEntry {
  changes: Record<string, { old: unknown; new: unknown }>;
}

interface StyleDiffReport {
  added: StyleDiffEntry[];
  removed: StyleDiffEntry[];
  modified: StyleDiffModified[];
  unchanged: number;
}

interface RegisteredStyles {
  textStyles: Array<{ key: string; name: string; fontSize: number; fontFamily: string; fontWeight: string }>;
  paintStyles: Array<{ key: string; name: string; hex: string }>;
  effectStyles: Array<{ key: string; name: string; effectType: string }>;
}

function diffStyles(fresh: RegisteredStyles, stored: RegisteredStyles): StyleDiffReport {
  const added: StyleDiffEntry[] = [];
  const removed: StyleDiffEntry[] = [];
  const modified: StyleDiffModified[] = [];
  let unchanged = 0;

  // Text styles — compare fontSize, fontFamily, fontWeight
  const storedTextMap = new Map(stored.textStyles.map((s) => [s.key, s]));
  for (const f of fresh.textStyles) {
    const s = storedTextMap.get(f.key);
    if (!s) {
      added.push({ type: 'text', key: f.key, name: f.name });
    } else {
      storedTextMap.delete(f.key);
      const changes: Record<string, { old: unknown; new: unknown }> = {};
      if (f.fontSize !== s.fontSize) changes.fontSize = { old: s.fontSize, new: f.fontSize };
      if (f.fontFamily !== s.fontFamily) changes.fontFamily = { old: s.fontFamily, new: f.fontFamily };
      if (f.fontWeight !== s.fontWeight) changes.fontWeight = { old: s.fontWeight, new: f.fontWeight };
      if (Object.keys(changes).length > 0) {
        modified.push({ type: 'text', key: f.key, name: f.name, changes });
      } else {
        unchanged++;
      }
    }
  }
  for (const s of storedTextMap.values()) {
    removed.push({ type: 'text', key: s.key, name: s.name });
  }

  // Paint styles — compare hex
  const storedPaintMap = new Map(stored.paintStyles.map((s) => [s.key, s]));
  for (const f of fresh.paintStyles) {
    const s = storedPaintMap.get(f.key);
    if (!s) {
      added.push({ type: 'paint', key: f.key, name: f.name });
    } else {
      storedPaintMap.delete(f.key);
      if (f.hex.toLowerCase() !== s.hex.toLowerCase()) {
        modified.push({ type: 'paint', key: f.key, name: f.name, changes: { hex: { old: s.hex, new: f.hex } } });
      } else {
        unchanged++;
      }
    }
  }
  for (const s of storedPaintMap.values()) {
    removed.push({ type: 'paint', key: s.key, name: s.name });
  }

  // Effect styles — compare effectType
  const storedEffectMap = new Map(stored.effectStyles.map((s) => [s.key, s]));
  for (const f of fresh.effectStyles) {
    const s = storedEffectMap.get(f.key);
    if (!s) {
      added.push({ type: 'effect', key: f.key, name: f.name });
    } else {
      storedEffectMap.delete(f.key);
      if (f.effectType !== s.effectType) {
        modified.push({ type: 'effect', key: f.key, name: f.name, changes: { effectType: { old: s.effectType, new: f.effectType } } });
      } else {
        unchanged++;
      }
    }
  }
  for (const s of storedEffectMap.values()) {
    removed.push({ type: 'effect', key: s.key, name: s.name });
  }

  return { added, removed, modified, unchanged };
}

// ─── Helpers ───

function fontWeightToString(weight: number): string {
  const map: Record<number, string> = {
    100: 'Thin',
    200: 'ExtraLight',
    300: 'Light',
    400: 'Regular',
    500: 'Medium',
    600: 'SemiBold',
    700: 'Bold',
    800: 'ExtraBold',
    900: 'Black',
  };
  return map[weight] ?? 'Regular';
}

function rgbaToHex(color: { r: number; g: number; b: number; a?: number }): string {
  const r = Math.round(color.r * 255).toString(16).padStart(2, '0');
  const g = Math.round(color.g * 255).toString(16).padStart(2, '0');
  const b = Math.round(color.b * 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}
