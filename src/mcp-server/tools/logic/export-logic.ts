/**
 * Export logic functions — extracted from export.ts server.tool() callbacks.
 * Shared by both flat tools and endpoint tools.
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
  const text = source === 'rest-api'
    ? JSON.stringify(result, null, 2) + '\n\n⚠️ Exported via REST API (plugin offline).'
    : JSON.stringify(result, null, 2);
  return { content: [{ type: 'text' as const, text }] };
}
