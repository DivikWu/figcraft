/**
 * REST API fallback for read-only operations when the Plugin is offline.
 *
 * Tries the Plugin bridge first (richer data, real-time).
 * If the bridge request fails (timeout / disconnect), falls back to
 * the Figma REST API when an API token is available.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getToken } from './auth.js';
import type { Bridge } from './bridge.js';
import { fetchFileInfo, fetchFileNodes, fetchNodeImages } from './figma-api.js';

/** Metadata about the current file, cached from the last successful plugin ping. */
interface FileContext {
  fileKey: string;
  documentName: string;
  /** Timestamp when the context was last updated (ms since epoch). */
  updatedAt: number;
}

/** Maximum age for persisted file context before it's considered stale (4 hours). */
const FILE_CONTEXT_TTL_MS = 4 * 60 * 60 * 1000;

let cachedFileContext: FileContext | null = null;

// ─── File context persistence ───

function contextPath(): string {
  return join(homedir(), '.config', 'figcraft', 'file-context.json');
}

function persistFileContext(ctx: FileContext): void {
  try {
    const dir = join(homedir(), '.config', 'figcraft');
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const tmp = `${contextPath()}.tmp`;
    writeFileSync(tmp, JSON.stringify(ctx), { mode: 0o600 });
    renameSync(tmp, contextPath());
  } catch {
    /* best effort */
  }
}

function loadPersistedFileContext(): FileContext | null {
  try {
    const raw = readFileSync(contextPath(), 'utf-8');
    const data = JSON.parse(raw) as FileContext;
    if (!data.fileKey) return null;
    // Reject stale context (e.g. user switched Figma files since last session)
    const age = Date.now() - (data.updatedAt ?? 0);
    if (age > FILE_CONTEXT_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

/** Update file context (called after a successful ping or get_document_info). */
export function setFileContext(fileKey: string, documentName: string): void {
  cachedFileContext = { fileKey, documentName, updatedAt: Date.now() };
  persistFileContext(cachedFileContext);
}

/** Manually set the file key (e.g. parsed from a Figma URL). */
export function setFileKey(fileKey: string): void {
  if (cachedFileContext) {
    cachedFileContext.fileKey = fileKey;
    cachedFileContext.updatedAt = Date.now();
  } else {
    cachedFileContext = { fileKey, documentName: '', updatedAt: Date.now() };
  }
  persistFileContext(cachedFileContext);
}

export function getFileContext(): FileContext | null {
  if (cachedFileContext?.fileKey) return cachedFileContext;
  // Try loading from disk
  const persisted = loadPersistedFileContext();
  if (persisted) {
    cachedFileContext = persisted;
    return persisted;
  }
  return null;
}

/**
 * Try a plugin bridge request; on failure, attempt REST API fallback.
 * Returns { result, source } so callers can indicate the data source.
 */
export async function requestWithFallback(
  bridge: Bridge,
  method: string,
  params: Record<string, unknown>,
  restFallback?: () => Promise<unknown>,
): Promise<{ result: unknown; source: 'plugin' | 'rest-api' }> {
  // Try plugin first
  try {
    const result = await bridge.request(method, params);
    return { result, source: 'plugin' };
  } catch (pluginErr) {
    // If no REST fallback provided, just throw the original error
    if (!restFallback) throw pluginErr;

    // Try REST API fallback
    try {
      console.error(`[FigCraft fallback] Plugin request "${method}" failed, falling back to REST API`);
      const result = await restFallback();
      return { result, source: 'rest-api' };
    } catch (restErr) {
      // If REST also fails, throw the original plugin error with a hint
      const msg = pluginErr instanceof Error ? pluginErr.message : String(pluginErr);
      const restMsg = restErr instanceof Error ? restErr.message : String(restErr);
      throw new Error(`Plugin: ${msg}. REST API fallback also failed: ${restMsg}`);
    }
  }
}

// ─── Fallback implementations for specific methods ───

/**
 * REST fallback for nodes(method: "get").
 * Fetches node data via GET /v1/files/:fileKey/nodes?ids=nodeId
 * Note: function name uses legacy bridge protocol name for internal consistency.
 */
export async function restGetNodeInfo(nodeId: string): Promise<unknown> {
  const ctx = getFileContext();
  if (!ctx?.fileKey) {
    throw new Error('No file key available. Open the file in Figma with the plugin, or provide a Figma URL.');
  }
  const token = await getToken();
  const nodes = await fetchFileNodes(ctx.fileKey, token, [nodeId]);
  const nodeData = nodes[nodeId];
  if (!nodeData) throw new Error(`Node ${nodeId} not found via REST API`);
  // REST API returns { document: {...} } per node
  const doc = (nodeData as Record<string, unknown>).document ?? nodeData;
  return doc;
}

/**
 * REST fallback for get_document_info (standalone tool).
 * Fetches file overview via GET /v1/files/:fileKey?depth=1
 */
export async function restGetDocumentInfo(): Promise<unknown> {
  const ctx = getFileContext();
  if (!ctx?.fileKey) {
    throw new Error('No file key available. Open the file in Figma with the plugin, or provide a Figma URL.');
  }
  const token = await getToken();
  const info = await fetchFileInfo(ctx.fileKey, token, 1);
  const pages = ((info.document as Record<string, unknown>).children as Array<Record<string, unknown>>) ?? [];
  return {
    documentName: info.name,
    pages: pages.map((p) => ({ id: p.id, name: p.name })),
    _source: 'rest-api',
  };
}

/**
 * REST fallback for export_image (standalone tool).
 * Fetches rendered image URL via GET /v1/images/:fileKey
 */
export async function restExportImage(nodeId: string, format: string = 'PNG', scale: number = 2): Promise<unknown> {
  const ctx = getFileContext();
  if (!ctx?.fileKey) {
    throw new Error('No file key available. Open the file in Figma with the plugin, or provide a Figma URL.');
  }
  const token = await getToken();
  const fmt = format.toLowerCase() as 'png' | 'svg' | 'pdf' | 'jpg';
  const images = await fetchNodeImages(ctx.fileKey, token, [nodeId], fmt, scale);
  const imageUrl = images[nodeId];
  if (!imageUrl) throw new Error(`Failed to export node ${nodeId} via REST API`);

  // Fetch the actual image and return base64
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to download exported image: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return {
    base64: buffer.toString('base64'),
    format: fmt.toUpperCase(),
    _source: 'rest-api',
  };
}
