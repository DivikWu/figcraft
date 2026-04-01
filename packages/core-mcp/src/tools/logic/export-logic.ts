/**
 * Export logic functions — extracted from export.ts server.tool() callbacks.
 * Used by endpoint tools for image export operations.
 */

import type { Bridge } from '../../bridge.js';
import { requestWithFallback, restExportImage } from '../../rest-fallback.js';
import type { McpResponse } from './node-logic.js';

export async function exportImageLogic(
  bridge: Bridge,
  params: { nodeId: string; format?: string; scale?: number },
): Promise<McpResponse> {
  const { result, source } = await requestWithFallback(
    bridge,
    'export_image',
    { nodeId: params.nodeId, format: params.format, scale: params.scale },
    () => restExportImage(params.nodeId, params.format, params.scale),
  );
  const r = result as { format?: string; size?: number; base64?: string };

  // Return image content block so IDE displays inline (plugin path only)
  if (source !== 'rest-api' && r.base64) {
    const MIME: Record<string, string> = {
      PNG: 'image/png', JPG: 'image/jpeg', SVG: 'image/svg+xml', PDF: 'application/pdf',
    };
    const mimeType = MIME[(r.format ?? 'PNG').toUpperCase()] ?? 'image/png';
    return {
      content: [
        { type: 'image' as const, data: r.base64, mimeType },
        { type: 'text' as const, text: JSON.stringify({ format: r.format, size: r.size }, null, 2) },
      ],
    };
  }

  // REST fallback or missing base64: text only
  const text = source === 'rest-api'
    ? JSON.stringify(result, null, 2) + '\n\n⚠️ Exported via REST API (plugin offline).'
    : JSON.stringify(result, null, 2);
  return { content: [{ type: 'text' as const, text }] };
}
