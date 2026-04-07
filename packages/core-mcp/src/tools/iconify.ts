/**
 * Iconify integration — search and fetch icons from 200k+ open-source icons.
 * Zero npm dependencies — pure fetch() against api.iconify.design.
 * In-memory cache: each icon+size combo is fetched once per MCP session.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Bridge } from '../bridge.js';
import { jsonResponse } from './response-helpers.js';

const ICONIFY_API = 'https://api.iconify.design';

// ─── Cache ───
const svgCache = new Map<string, string>();

// ─── Name parsing ───
const NAME_RE = /^([a-z0-9][a-z0-9-]*):([a-z0-9][a-z0-9-]*)$/;

function parseIconName(icon: string): { prefix: string; name: string } | null {
  const m = icon.match(NAME_RE);
  return m ? { prefix: m[1], name: m[2] } : null;
}

// ─── Fetch SVG ───
export async function fetchIconSvg(icon: string, size?: number): Promise<{ svg: string } | { error: string }> {
  const parsed = parseIconName(icon);
  if (!parsed) {
    return { error: `Invalid icon name "${icon}". Use "prefix:name" format (e.g. "lucide:home", "mdi:account").` };
  }
  const height = size ?? 24;
  const cacheKey = `${icon}@${height}`;
  const cached = svgCache.get(cacheKey);
  if (cached) return { svg: cached };

  const url = `${ICONIFY_API}/${parsed.prefix}/${parsed.name}.svg?height=${height}`;
  const res = await fetch(url);
  if (!res.ok) {
    return {
      error: `Icon "${icon}" not found (HTTP ${res.status}). Check the name at https://icon-sets.iconify.design/`,
    };
  }
  const svg = await res.text();
  if (!svg.startsWith('<svg')) {
    return { error: `Icon "${icon}" returned invalid SVG.` };
  }
  svgCache.set(cacheKey, svg);
  return { svg };
}

// ─── Search icons ───
async function searchIcons(query: string, prefix?: string, limit?: number): Promise<unknown> {
  const params = new URLSearchParams({ query, limit: String(limit ?? 64) });
  if (prefix) params.set('prefix', prefix);
  const res = await fetch(`${ICONIFY_API}/search?${params}`);
  if (!res.ok) return { error: `Search failed (HTTP ${res.status})` };
  const data = (await res.json()) as { icons: string[]; total: number };
  return { icons: data.icons ?? [], total: data.total ?? 0 };
}

// ─── List collections ───
async function listCollections(query?: string, limit?: number): Promise<unknown> {
  const res = await fetch(`${ICONIFY_API}/collections`);
  if (!res.ok) return { error: `Collections fetch failed (HTTP ${res.status})` };
  const data = (await res.json()) as Record<
    string,
    { name: string; total: number; category?: string; license?: { title: string } }
  >;
  let collections = Object.entries(data).map(([prefix, info]) => ({
    prefix,
    name: info.name,
    total: info.total,
    category: info.category ?? '',
    license: info.license?.title ?? '',
  }));
  if (query) {
    const q = query.toLowerCase();
    collections = collections.filter((c) => c.prefix.includes(q) || c.name.toLowerCase().includes(q));
  }
  const total = collections.length;
  if (limit) collections = collections.slice(0, limit);
  return { collections, total };
}

// ─── Register MCP tools ───
export function registerIconTools(server: McpServer, bridge: Bridge): void {
  server.tool(
    'icon_search',
    'Search icons by keyword across 200k+ open-source icons via Iconify. ' +
      'Common sets: lucide, mdi, tabler, heroicons, ph. Returns icon names in "prefix:name" format.',
    {
      query: z.string().describe('Search keyword (e.g. "home", "arrow", "user")'),
      prefix: z.string().optional().describe('Restrict to one icon set (e.g. "lucide", "mdi")'),
      limit: z.number().optional().describe('Max results (default: 64)'),
    },
    async ({ query, prefix, limit }) => {
      const result = await searchIcons(query, prefix, limit);
      return jsonResponse(result);
    },
  );

  server.tool(
    'icon_collections',
    'List available Iconify icon sets with name, total count, and category.',
    {
      query: z.string().optional().describe('Filter by name or prefix'),
      limit: z.number().optional().describe('Max results'),
    },
    async ({ query, limit }) => {
      const result = await listCollections(query, limit);
      return jsonResponse(result);
    },
  );

  server.tool(
    'icon_create',
    'Create an icon node in Figma from an Iconify icon name. ' +
      'Fetches the SVG and inserts it as a vector node. Use icon_search to find icons first.',
    {
      icon: z.string().describe('Icon name — "prefix:name" e.g. "lucide:home", "mdi:account"'),
      size: z.number().optional().describe('Icon size in px (default: 24, square)'),
      name: z.string().optional().describe('Layer name (default: icon name)'),
      parentId: z.string().optional().describe('Parent node ID'),
      x: z.number().optional().describe('X position'),
      y: z.number().optional().describe('Y position'),
      index: z
        .number()
        .optional()
        .describe(
          "Insertion position in parent's children list (0 = first child, visually leftmost/topmost in auto-layout). Default: append to end.",
        ),
      colorVariableName: z.string().optional().describe('Color variable for the icon (e.g. "text/primary")'),
      fill: z
        .string()
        .optional()
        .describe(
          "Icon color as hex (e.g. '#FFFFFF'). Applied directly to fill/stroke vectors. Use colorVariableName for token binding instead.",
        ),
    },
    async ({ icon, size, name, parentId, x, y, colorVariableName, fill, index }) => {
      // 1. Fetch SVG from Iconify
      const result = await fetchIconSvg(icon, size);
      if ('error' in result) {
        return jsonResponse({ error: result.error });
      }

      // 2. Send to Figma plugin to create SVG node
      const createParams: Record<string, unknown> = {
        svg: result.svg,
        name: name ?? icon,
      };
      if (parentId) createParams.parentId = parentId;
      if (x != null) createParams.x = x;
      if (y != null) createParams.y = y;
      if (index != null) createParams.index = index;
      if (colorVariableName) createParams.colorVariableName = colorVariableName;
      if (fill) createParams.fill = fill;

      const figmaResult = await bridge.request('create_icon_svg', createParams);
      return jsonResponse(figmaResult);
    },
  );
}
