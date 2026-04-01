/**
 * Export handler — export node as PNG/SVG/PDF/JPG image.
 */

import { registerHandler } from '../registry.js';
import { findNodeByIdAsync } from '../utils/node-lookup.js';
import { assertHandler } from '../utils/handler-error.js';

export function registerExportHandlers(): void {

registerHandler('export_image', async (params) => {
  const nodeId = params.nodeId as string;
  const format = ((params.format as string) ?? 'PNG').toUpperCase() as
    | 'PNG'
    | 'SVG'
    | 'PDF'
    | 'JPG';
  const scale = (params.scale as number) ?? 2;

  const node = await findNodeByIdAsync(nodeId);
  assertHandler(
    node && 'exportAsync' in node,
    `Node not found or not exportable: ${nodeId}`,
    'NOT_FOUND',
  );

  const exportNode = node as SceneNode & { exportAsync: (settings: ExportSettings) => Promise<Uint8Array> };

  const settings: ExportSettings =
    format === 'SVG'
      ? { format: 'SVG' }
      : format === 'PDF'
        ? { format: 'PDF' }
        : { format: format as 'PNG' | 'JPG', constraint: { type: 'SCALE', value: scale } };

  const EXPORT_TIMEOUT = 10_000; // 10s — exportAsync can hang on complex nodes
  const bytes = await Promise.race([
    exportNode.exportAsync(settings),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(
      `Export timed out after ${EXPORT_TIMEOUT / 1000}s — node may be too complex. Try a lower scale or export a smaller section.`
    )), EXPORT_TIMEOUT)),
  ]);

  // Convert to base64 for transport
  const base64 = figma.base64Encode(bytes);

  return {
    format,
    size: bytes.byteLength,
    base64,
  };
});

} // registerExportHandlers
