/**
 * Figma REST API client — fetch library styles that Plugin API cannot enumerate.
 *
 * Uses Node 18+ native fetch. No additional dependencies.
 * Authentication via Personal Access Token (X-Figma-Token header).
 */

const BASE_URL = 'https://api.figma.com';

// ─── Types ───

export interface FigmaStyleMeta {
  key: string;
  file_key: string;
  node_id: string;
  style_type: 'TEXT' | 'FILL' | 'EFFECT' | 'GRID';
  name: string;
  description: string;
}

export interface FigmaTextStyleProps {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  letterSpacing: { value: number; unit: string };
  lineHeight: { value?: number; unit: string };
  textCase: string;
  textDecoration: string;
}

export interface FigmaPaintStyleProps {
  fills: Array<{
    type: string;
    color?: { r: number; g: number; b: number; a: number };
    opacity?: number;
  }>;
}

export interface FigmaEffectStyleProps {
  effects: Array<{
    type: string;
    visible: boolean;
    radius?: number;
    offset?: { x: number; y: number };
    color?: { r: number; g: number; b: number; a: number };
  }>;
}

export type FigmaStyleProps = FigmaTextStyleProps | FigmaPaintStyleProps | FigmaEffectStyleProps;

export interface FigmaStyleDetail extends FigmaStyleMeta {
  properties: FigmaStyleProps;
}

// ─── Helpers ───

async function figmaFetch(path: string, token: string, attempt = 0): Promise<unknown> {
  // PAT tokens start with "figd_", use X-Figma-Token header; OAuth uses Bearer
  const headers: Record<string, string> = token.startsWith('figd_')
    ? { 'X-Figma-Token': token }
    : { Authorization: `Bearer ${token}` };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, { headers, signal: controller.signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error(`Figma API request timed out after 30s: ${path}`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 429 && attempt < 3) {
      const retryAfter = Math.min(Math.max(parseInt(res.headers.get('retry-after') ?? '5', 10), 1), 60);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return figmaFetch(path, token, attempt + 1);
    }
    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after');
      throw new Error(
        `Figma API rate limited (429). ${retryAfter ? `Retry after ${retryAfter}s.` : 'Please wait and retry.'}`,
      );
    }
    throw new Error(`Figma API error ${res.status}: ${body || res.statusText}`);
  }

  return res.json();
}

/** Split array into chunks of given size. */
function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

// ─── Public API ───

/**
 * Fetch published style metadata from a Figma file.
 * GET /v1/files/:fileKey/styles
 */
export async function fetchLibraryStyles(
  fileKey: string,
  token: string,
  styleType?: 'TEXT' | 'FILL' | 'EFFECT' | 'GRID',
): Promise<FigmaStyleMeta[]> {
  const data = (await figmaFetch(`/v1/files/${fileKey}/styles`, token)) as {
    meta: { styles: FigmaStyleMeta[] };
  };

  let styles = data.meta.styles;
  if (styleType) {
    styles = styles.filter((s) => s.style_type === styleType);
  }
  return styles;
}

/**
 * Fetch full node properties for specific style nodes.
 * GET /v1/files/:fileKey/nodes?ids=nodeId1,nodeId2
 *
 * Batches IDs in chunks of 50 to stay within URL length limits.
 * Returns a map of nodeId → extracted style properties.
 */
export async function fetchStyleNodeDetails(
  fileKey: string,
  token: string,
  styles: FigmaStyleMeta[],
): Promise<FigmaStyleDetail[]> {
  const results: FigmaStyleDetail[] = [];
  const batches = chunk(styles, 50);

  for (const batch of batches) {
    const ids = batch.map((s) => s.node_id).join(',');
    const data = (await figmaFetch(`/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(ids)}`, token)) as {
      nodes: Record<string, { document: Record<string, unknown> } | null>;
    };

    for (const style of batch) {
      const nodeData = data.nodes[style.node_id];
      if (!nodeData?.document) {
        continue;
      }

      const doc = nodeData.document;
      const props = extractStyleProperties(style.style_type, doc);
      if (props) {
        results.push({ ...style, properties: props });
      }
    }
  }

  return results;
}

/**
 * Fetch published component metadata from a Figma file.
 * GET /v1/files/:fileKey/components
 */
export interface FigmaComponentMeta {
  key: string;
  name: string;
  description: string;
  containing_frame: { name: string; containingComponentSet?: string } | null;
}

export async function fetchLibraryComponents(fileKey: string, token: string): Promise<FigmaComponentMeta[]> {
  const data = (await figmaFetch(`/v1/files/${fileKey}/components`, token)) as {
    meta: { components: FigmaComponentMeta[] };
  };
  return data.meta.components ?? [];
}

/**
 * Fetch published component set metadata from a Figma file.
 * GET /v1/files/:fileKey/component_sets
 */
export interface FigmaComponentSetMeta {
  key: string;
  name: string;
  description: string;
  node_id: string;
  containing_frame: { name: string } | null;
}

export async function fetchLibraryComponentSets(fileKey: string, token: string): Promise<FigmaComponentSetMeta[]> {
  const data = (await figmaFetch(`/v1/files/${fileKey}/component_sets`, token)) as {
    meta: { component_sets: FigmaComponentSetMeta[] };
  };
  return data.meta.component_sets ?? [];
}

/**
 * Group components by their component set, parsing variant properties from names.
 * Returns a structured view: component sets with their variants, plus standalone components.
 */
export interface GroupedLibraryComponents {
  componentSets: Array<{
    key: string;
    name: string;
    description: string;
    variants: Array<{
      key: string;
      name: string;
      properties: Record<string, string>;
    }>;
  }>;
  standalone: Array<{
    key: string;
    name: string;
    description: string;
  }>;
}

export function groupComponentsBySet(
  components: FigmaComponentMeta[],
  componentSets: FigmaComponentSetMeta[],
): GroupedLibraryComponents {
  // Build a map of component set node_id → set metadata
  const setByNodeId = new Map(componentSets.map((s) => [s.node_id, s]));

  // Group components by their containing component set
  const setComponents = new Map<string, FigmaComponentMeta[]>();
  const standalone: FigmaComponentMeta[] = [];

  for (const comp of components) {
    const setNodeId = comp.containing_frame?.containingComponentSet;
    if (setNodeId && setByNodeId.has(setNodeId)) {
      if (!setComponents.has(setNodeId)) setComponents.set(setNodeId, []);
      setComponents.get(setNodeId)!.push(comp);
    } else {
      standalone.push(comp);
    }
  }

  // Build grouped result
  const groupedSets = componentSets
    .map((set) => {
      const variants = (setComponents.get(set.node_id) || []).map((comp) => ({
        key: comp.key,
        name: comp.name,
        properties: parseVariantName(comp.name),
      }));
      return {
        key: set.key,
        name: set.name,
        description: set.description,
        variants,
      };
    })
    .filter((s) => s.variants.length > 0);

  return {
    componentSets: groupedSets,
    standalone: standalone.map((c) => ({
      key: c.key,
      name: c.name,
      description: c.description,
    })),
  };
}

/**
 * Parse a Figma variant name like "Type=Primary, Size=Small, State=Default"
 * into a property map: { Type: "Primary", Size: "Small", State: "Default" }
 */
function parseVariantName(name: string): Record<string, string> {
  const props: Record<string, string> = {};
  for (const part of name.split(',')) {
    const eq = part.indexOf('=');
    if (eq > 0) {
      props[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
    }
  }
  return props;
}

/**
 * Fetch file name (= library name) from a Figma file.
 * GET /v1/files/:fileKey?depth=1
 */
export async function fetchFileName(fileKey: string, token: string): Promise<string> {
  const data = (await figmaFetch(`/v1/files/${fileKey}?depth=1`, token)) as { name: string };
  return data.name;
}

// ─── REST API Read Operations (fallback when plugin is offline) ───

/**
 * Fetch specific nodes from a Figma file by IDs.
 * GET /v1/files/:fileKey/nodes?ids=nodeId
 */
export async function fetchFileNodes(
  fileKey: string,
  token: string,
  nodeIds: string[],
): Promise<Record<string, unknown>> {
  const ids = nodeIds.join(',');
  const data = (await figmaFetch(`/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(ids)}`, token)) as {
    nodes: Record<string, { document: Record<string, unknown> } | null>;
  };
  return data.nodes;
}

/**
 * Fetch file overview: name, pages, and optionally shallow node tree.
 * GET /v1/files/:fileKey?depth=:depth
 */
export async function fetchFileInfo(
  fileKey: string,
  token: string,
  depth = 1,
): Promise<{ name: string; document: Record<string, unknown> }> {
  const data = (await figmaFetch(`/v1/files/${fileKey}?depth=${depth}`, token)) as {
    name: string;
    document: Record<string, unknown>;
  };
  return data;
}

/**
 * Export node images via REST API.
 * GET /v1/images/:fileKey?ids=nodeId&format=png&scale=2
 */
export async function fetchNodeImages(
  fileKey: string,
  token: string,
  nodeIds: string[],
  format: 'png' | 'svg' | 'pdf' | 'jpg' = 'png',
  scale = 2,
): Promise<Record<string, string | null>> {
  const ids = nodeIds.join(',');
  const data = (await figmaFetch(
    `/v1/images/${fileKey}?ids=${encodeURIComponent(ids)}&format=${format}&scale=${scale}`,
    token,
  )) as { images: Record<string, string | null> };
  return data.images;
}

// ─── Utility ───

/** Extract fileKey from a Figma URL. Supports /file/ and /design/ formats. */
export function extractFileKeyFromUrl(url: string): string | null {
  const match = url.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

/** Extract nodeId from a Figma URL query parameter. */
export function extractNodeIdFromUrl(url: string): string | null {
  const match = url.match(/node-id=([^&]+)/);
  if (!match) return null;
  // URL-encoded "705-60" → "705:60"
  return decodeURIComponent(match[1]).replaceAll('-', ':');
}

// ─── Property extraction ───

function extractStyleProperties(styleType: string, doc: Record<string, unknown>): FigmaStyleProps | null {
  switch (styleType) {
    case 'TEXT':
      return extractTextStyleProps(doc);
    case 'FILL':
      return extractPaintStyleProps(doc);
    case 'EFFECT':
      return extractEffectStyleProps(doc);
    default:
      return null;
  }
}

function extractTextStyleProps(doc: Record<string, unknown>): FigmaTextStyleProps {
  const style = (doc.style ?? {}) as Record<string, unknown>;
  return {
    fontFamily: (style.fontFamily as string) ?? 'Inter',
    fontSize: (style.fontSize as number) ?? 16,
    fontWeight: (style.fontWeight as number) ?? 400,
    letterSpacing: (style.letterSpacing as { value: number; unit: string }) ?? { value: 0, unit: 'PIXELS' },
    lineHeight: (style.lineHeightPercentFontSize as { value?: number; unit: string }) ??
      (style.lineHeight as { value?: number; unit: string }) ?? { unit: 'AUTO' },
    textCase: (style.textCase as string) ?? 'ORIGINAL',
    textDecoration: (style.textDecoration as string) ?? 'NONE',
  };
}

function extractPaintStyleProps(doc: Record<string, unknown>): FigmaPaintStyleProps {
  const fills = (doc.fills as FigmaPaintStyleProps['fills']) ?? [];
  return { fills };
}

function extractEffectStyleProps(doc: Record<string, unknown>): FigmaEffectStyleProps {
  const effects = (doc.effects as FigmaEffectStyleProps['effects']) ?? [];
  return { effects };
}
