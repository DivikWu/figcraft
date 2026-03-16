/**
 * Figma Plugin sandbox entry — code.js
 *
 * Receives commands from UI iframe via postMessage,
 * executes Figma Plugin API calls, and returns results.
 */

import { handlers, registerHandler } from './registry.js';
import { getLibraryDesignContext, getLocalDesignContext, clearDesignContextCache } from './utils/design-context.js';
import { getRegisteredStylesSummary, clearStyleRegistry } from './utils/style-registry.js';

// ─── P1 handlers (read) ───
import { registerNodeHandlers } from './handlers/nodes.js';
import { registerVariableHandlers } from './handlers/variables.js';
import { registerStyleHandlers } from './handlers/styles.js';
import { registerLibraryHandlers } from './handlers/library.js';
import { registerExportHandlers } from './handlers/export.js';

// ─── P2 handlers (write) ───
import { registerWriteNodeHandlers } from './handlers/write-nodes.js';
import { registerWriteVariableHandlers } from './handlers/write-variables.js';
import { registerWriteStyleHandlers } from './handlers/write-styles.js';
import { registerComponentHandlers } from './handlers/components.js';
import { registerStorageHandlers } from './handlers/storage.js';
import { registerPageHandlers } from './handlers/pages.js';
import { registerSelectionHandlers } from './handlers/selection.js';

// ─── P3 handlers (lint) ───
import { registerLintHandlers } from './handlers/lint.js';

// ─── P4 handlers (scan) ───
import { registerScanHandlers } from './handlers/scan.js';

// ─── Register all handlers ───
registerNodeHandlers();
registerVariableHandlers();
registerStyleHandlers();
registerLibraryHandlers();
registerExportHandlers();
registerWriteNodeHandlers();
registerWriteVariableHandlers();
registerWriteStyleHandlers();
registerComponentHandlers();
registerStorageHandlers();
registerPageHandlers();
registerSelectionHandlers();
registerLintHandlers();
registerScanHandlers();

// Show the UI (establishes WebSocket connection to relay)
figma.showUI(__html__, { visible: true, width: 320, height: 400 });

// ─── Channel, mode & library persistence via clientStorage ───
const CHANNEL_STORAGE_KEY = 'figcraft_channel';
const MODE_STORAGE_KEY = 'figcraft_mode';
const LIBRARY_STORAGE_KEY = 'figcraft_library';
const API_TOKEN_STORAGE_KEY = 'figcraft_api_token';

figma.ui.on('message', async (msg: { type: string; channelId?: string; mode?: string; library?: string; token?: string }) => {
  if (msg.type === 'get-channel') {
    const saved = await figma.clientStorage.getAsync(CHANNEL_STORAGE_KEY);
    if (saved) {
      figma.ui.postMessage({ type: 'restore-channel', channelId: saved });
    }
  } else if (msg.type === 'save-channel' && msg.channelId) {
    await figma.clientStorage.setAsync(CHANNEL_STORAGE_KEY, msg.channelId);
  } else if (msg.type === 'get-mode') {
    const saved = await figma.clientStorage.getAsync(MODE_STORAGE_KEY);
    figma.ui.postMessage({ type: 'restore-mode', mode: saved || 'library' });
  } else if (msg.type === 'save-mode' && msg.mode) {
    await figma.clientStorage.setAsync(MODE_STORAGE_KEY, msg.mode);
  } else if (msg.type === 'get-library') {
    const saved = await figma.clientStorage.getAsync(LIBRARY_STORAGE_KEY);
    figma.ui.postMessage({ type: 'restore-library', library: saved || null });
  } else if (msg.type === 'save-library') {
    await figma.clientStorage.setAsync(LIBRARY_STORAGE_KEY, msg.library || '');
    clearDesignContextCache();
    clearStyleRegistry();
  } else if (msg.type === 'get-token') {
    const saved = await figma.clientStorage.getAsync(API_TOKEN_STORAGE_KEY);
    figma.ui.postMessage({ type: 'restore-token', token: saved || '' });
  } else if (msg.type === 'save-token') {
    await figma.clientStorage.setAsync(API_TOKEN_STORAGE_KEY, msg.token || '');
  } else if (msg.type === 'get-libraries') {
    const collections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
    const uniqueLibraries = [...new Set(collections.map((c) => c.libraryName))];
    const savedLibrary = await figma.clientStorage.getAsync(LIBRARY_STORAGE_KEY);

    // Detect local styles/variables
    const localCollections = await figma.variables.getLocalVariableCollectionsAsync();
    const localPaintStyles = await figma.getLocalPaintStylesAsync();
    const localTextStyles = await figma.getLocalTextStylesAsync();
    const localEffectStyles = await figma.getLocalEffectStylesAsync();
    const hasLocal = localCollections.length > 0
      || localPaintStyles.length > 0
      || localTextStyles.length > 0
      || localEffectStyles.length > 0;

    figma.ui.postMessage({
      type: 'library-list',
      libraries: uniqueLibraries,
      savedLibrary: savedLibrary || null,
      hasLocal,
    });
  }
});

// ─── Built-in handlers ───

registerHandler('ping', async () => {
  return {
    status: 'ok',
    documentName: figma.root.name,
    currentPage: figma.currentPage.name,
    timestamp: Date.now(),
  };
});

registerHandler('get_mode', async () => {
  const mode = (await figma.clientStorage.getAsync(MODE_STORAGE_KEY)) || 'library';
  const library = await figma.clientStorage.getAsync(LIBRARY_STORAGE_KEY);

  let designContext = null;
  if (mode === 'library' && library) {
    try {
      designContext = library === '__local__'
        ? await getLocalDesignContext()
        : await getLibraryDesignContext(library);

      // Include registered styles summary
      const registered = await getRegisteredStylesSummary(library);
      if (registered) {
        designContext.registeredStyles = {
          textStyles: registered.textStyles.map((s) => ({ name: s.name, fontSize: s.fontSize, fontFamily: s.fontFamily })),
          paintStyles: registered.paintStyles.map((s) => ({ name: s.name, hex: s.hex })),
          effectStyles: registered.effectStyles.map((s) => ({ name: s.name, effectType: s.effectType })),
        };
      }
    } catch (err) { console.warn('[figcraft] get_mode designContext failed:', err); }
  }

  return { mode, selectedLibrary: library || null, designContext };
});

registerHandler('set_mode', async (params) => {
  const mode = (params.mode as string) || 'library';
  await figma.clientStorage.setAsync(MODE_STORAGE_KEY, mode);
  if (params.library !== undefined) {
    await figma.clientStorage.setAsync(LIBRARY_STORAGE_KEY, params.library as string);
    figma.ui.postMessage({ type: 'library-changed', library: params.library });
    clearDesignContextCache();
    clearStyleRegistry();
  }
  figma.ui.postMessage({ type: 'mode-changed', mode });
  const library = await figma.clientStorage.getAsync(LIBRARY_STORAGE_KEY);
  return { mode, selectedLibrary: library || null };
});

// ─── Message routing ───

figma.ui.onmessage = async (msg: {
  id: string;
  type: string;
  method: string;
  params: Record<string, unknown>;
}) => {
  if (msg.type !== 'request') return;

  const handler = handlers.get(msg.method);
  if (!handler) {
    figma.ui.postMessage({
      id: msg.id,
      type: 'error',
      error: { code: 'METHOD_NOT_FOUND', message: `Unknown method: ${msg.method}` },
    });
    return;
  }

  try {
    const result = await handler(msg.params);
    figma.ui.postMessage({
      id: msg.id,
      type: 'response',
      result,
    });
  } catch (err) {
    figma.ui.postMessage({
      id: msg.id,
      type: 'error',
      error: {
        code: 'HANDLER_ERROR',
        message: err instanceof Error ? err.message : String(err),
      },
    });
  }
};
