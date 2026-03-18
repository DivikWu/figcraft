/**
 * Figma Plugin sandbox entry — code.js
 *
 * Receives commands from UI iframe via postMessage,
 * executes Figma Plugin API calls, and returns results.
 */

import { handlers, registerHandler } from './registry.js';
import { getLibraryDesignContext, getLocalDesignContext, clearDesignContextCache } from './utils/design-context.js';
import { getRegisteredStylesSummary, clearStyleRegistry } from './utils/style-registry.js';
import { STORAGE_KEYS, PLUGIN_VERSION } from './constants.js';

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
import { registerAnnotationHandlers } from './handlers/annotations.js';

// ─── P4 handlers (scan) ───
import { registerScanHandlers } from './handlers/scan.js';

// ─── P5 handlers (image/vector) ───
import { registerImageVectorHandlers } from './handlers/image-vector.js';

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
registerAnnotationHandlers();
registerScanHandlers();
registerImageVectorHandlers();

// Show the UI (establishes WebSocket connection to relay)
figma.showUI(__html__, { visible: true, width: 320, height: 480 });

// ─── Channel, mode & library persistence via clientStorage ───
const CHANNEL_STORAGE_KEY = STORAGE_KEYS.CHANNEL;
const MODE_STORAGE_KEY = STORAGE_KEYS.MODE;
const LIBRARY_STORAGE_KEY = STORAGE_KEYS.LIBRARY;
const API_TOKEN_STORAGE_KEY = STORAGE_KEYS.API_TOKEN;
const LIBRARY_URLS_STORAGE_KEY = STORAGE_KEYS.LIBRARY_URLS;
const LANG_STORAGE_KEY = STORAGE_KEYS.LANG;

// Library entries storage: { fileKey: { name, url } }
interface LibraryEntry { name: string; url: string; }

async function getLibraryEntries(): Promise<Record<string, LibraryEntry>> {
  const raw = await figma.clientStorage.getAsync(LIBRARY_URLS_STORAGE_KEY);
  if (!raw || typeof raw !== 'object') return {};
  // Migrate old format { libraryName: url } to new { fileKey: { name, url } }
  const entries = raw as Record<string, unknown>;
  const first = Object.values(entries)[0];
  if (typeof first === 'string') {
    // Old format: { libraryName: url }
    const migrated: Record<string, LibraryEntry> = {};
    const urlRe = /figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/;
    for (const [name, url] of Object.entries(entries)) {
      if (typeof url !== 'string') continue;
      const m = url.match(urlRe);
      if (m) migrated[m[1]] = { name, url };
    }
    await figma.clientStorage.setAsync(LIBRARY_URLS_STORAGE_KEY, migrated);
    return migrated;
  }
  return raw as Record<string, LibraryEntry>;
}

async function sendLibraryList() {
  const entries = await getLibraryEntries();
  const libraries = Object.entries(entries).map(([fileKey, entry]) => ({
    name: entry.name,
    fileKey,
  }));
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

  // Detect which libraries have variables imported into the current file
  const availableCollections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
  const remoteCollectionKeys = new Set(
    localCollections.filter((c) => c.remote).map((c) => c.key),
  );
  const inUseLibraries = [...new Set(
    availableCollections
      .filter((c) => remoteCollectionKeys.has(c.key))
      .map((c) => c.libraryName),
  )];

  figma.ui.postMessage({
    type: 'library-list',
    libraries,
    inUseLibraries,
    savedLibrary: savedLibrary || null,
    hasLocal,
  });
}

figma.ui.on('message', async (msg: { type: string; channelId?: string; mode?: string; library?: string; token?: string; fileKey?: string; name?: string; url?: string; libraryName?: string; violations?: unknown[] }) => {
  // ─── Focus node: select + zoom to a specific node ───
  if (msg.type === 'focus-node') {
    const nodeId = (msg as { nodeId?: string }).nodeId;
    if (nodeId) {
      const node = await figma.getNodeByIdAsync(nodeId);
      if (node && node.type !== 'PAGE' && node.type !== 'DOCUMENT') {
        const sceneNode = node as SceneNode;
        figma.currentPage.selection = [sceneNode];
        figma.viewport.scrollAndZoomIntoView([sceneNode]);
      }
    }
    return;
  }

  // ─── Annotate a single lint category ───
  if (msg.type === 'annotate-category') {
    const violations = (msg as { violations?: Array<{ nodeId: string; suggestion: string }> }).violations || [];
    let annotated = 0;
    for (const v of violations) {
      const node = await figma.getNodeByIdAsync(v.nodeId);
      if (!node) continue;
      if (!('annotations' in node)) continue;
      const sn = node as SceneNode & { annotations: Array<{ label: string; labelMarkdown?: string }> };
      const existing = sn.annotations || [];
      // Find existing FigCraft annotation to merge into
      const fcIdx = existing.findIndex(
        (a) => a.label.startsWith('[FigCraft]') || a.label.startsWith('[figcraft]'),
      );
      if (fcIdx >= 0) {
        // Extract existing tips and merge with new one
        const oldLabel = existing[fcIdx].label.replace(/^\[FigCraft\]\s*/, '').replace(/^\[figcraft\]\s*/, '');
        const oldTips = oldLabel.split(' · ').filter(Boolean);
        if (!oldTips.includes(v.suggestion)) {
          oldTips.push(v.suggestion);
        }
        const merged = [...existing];
        merged[fcIdx] = { label: '[FigCraft] ' + oldTips.join(' · ') };
        sn.annotations = merged;
      } else {
        sn.annotations = [...existing, { label: '[FigCraft] ' + v.suggestion }];
      }
      annotated++;
    }
    figma.ui.postMessage({ type: 'annotate-category-result', annotated });
    return;
  }

  // ─── Clear annotations for specific node IDs (by category) ───
  if (msg.type === 'clear-category-annotations') {
    const nodeIds = (msg as { nodeIds?: string[] }).nodeIds || [];
    const suggestion = (msg as { suggestion?: string }).suggestion || '';
    let cleared = 0;
    for (const nodeId of nodeIds) {
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node || !('annotations' in node)) continue;
      const sn = node as SceneNode & { annotations: Array<{ label: string }> };
      const annotations = sn.annotations || [];
      const updated: Array<{ label: string }> = [];
      for (const a of annotations) {
        if (!a.label.startsWith('[FigCraft]') && !a.label.startsWith('[figcraft]')) {
          updated.push(a);
          continue;
        }
        // Remove the specific tip from the merged annotation
        const body = a.label.replace(/^\[FigCraft\]\s*/, '').replace(/^\[figcraft\]\s*/, '');
        const tips = body.split(' · ').filter(function(t) { return t !== suggestion; });
        if (tips.length > 0) {
          updated.push({ label: '[FigCraft] ' + tips.join(' · ') });
        }
        // If no tips left, drop the annotation entirely
      }
      if (updated.length < annotations.length || JSON.stringify(updated) !== JSON.stringify(annotations)) {
        sn.annotations = updated;
        cleared++;
      }
    }
    figma.ui.postMessage({ type: 'clear-category-annotations-result', cleared });
    return;
  }

  // ─── Clear all FigCraft annotations on current page ───
  if (msg.type === 'clear-annotations') {
    let cleared = 0;
    function walkClear(node: SceneNode) {
      if ('annotations' in node) {
        const sn = node as SceneNode & { annotations: Array<{ label: string }> };
        const before = (sn.annotations || []).length;
        sn.annotations = (sn.annotations || []).filter(function(a) { return !a.label || a.label.indexOf('[FigCraft]') !== 0; });
        if (sn.annotations.length < before) cleared++;
      }
      if ('children' in node) {
        for (const child of (node as ChildrenMixin).children) {
          walkClear(child as SceneNode);
        }
      }
    }
    // Scope: selection first, fallback to current page
    const targets = figma.currentPage.selection.length > 0
      ? [...figma.currentPage.selection]
      : [...figma.currentPage.children];
    for (const node of targets) { walkClear(node); }
    figma.ui.postMessage({ type: 'clear-annotations-result', cleared });
    return;
  }

  if (msg.type === 'ui-lint-check') {
    // UI-initiated lint: run lint on current page and send result back to UI
    try {
      const handler = handlers.get('lint_check');
      if (handler) {
        const maxV = (msg as { maxViolations?: number }).maxViolations;
        const result = await handler({ maxViolations: maxV ?? 500 });
        figma.ui.postMessage({ type: 'lint-result', report: result });
      }
    } catch (err) {
      figma.ui.postMessage({ type: 'lint-result', report: { summary: { total: 0, pass: 0, violations: 0 }, categories: [] }, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  if (msg.type === 'ui-lint-fix') {
    // UI-initiated fix
    try {
      const handler = handlers.get('lint_fix');
      if (handler && msg.violations) {
        const result = await handler({ violations: msg.violations });
        figma.ui.postMessage({ type: 'lint-fix-result', result });
      }
    } catch (err) {
      figma.ui.postMessage({ type: 'lint-fix-result', result: { fixed: 0, failed: 0 }, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  if (msg.type === 'get-lang') {
    const lang = await figma.clientStorage.getAsync(LANG_STORAGE_KEY);
    figma.ui.postMessage({ type: 'restore-lang', lang: lang || 'en' });
  } else if (msg.type === 'save-lang') {
    await figma.clientStorage.setAsync(LANG_STORAGE_KEY, (msg as { lang?: string }).lang || 'en');
  } else if (msg.type === 'get-channel') {
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
  } else if (msg.type === 'save-library-entry') {
    const fk = (msg.fileKey || '').trim();
    const name = (msg.name || '').trim();
    const url = (msg.url || '').trim();
    if (fk && name) {
      const entries = await getLibraryEntries();
      entries[fk] = { name, url };
      await figma.clientStorage.setAsync(LIBRARY_URLS_STORAGE_KEY, entries);
    }
    await sendLibraryList();
  } else if (msg.type === 'remove-library-entry') {
    const fk = (msg.fileKey || '').trim();
    if (fk) {
      const entries = await getLibraryEntries();
      delete entries[fk];
      await figma.clientStorage.setAsync(LIBRARY_URLS_STORAGE_KEY, entries);
    }
    await sendLibraryList();
  } else if (msg.type === 'get-libraries') {
    await sendLibraryList();
  }
});

// ─── Built-in handlers ───

registerHandler('ping', async () => {
  return {
    status: 'ok',
    pluginVersion: PLUGIN_VERSION,
    documentName: figma.root.name,
    currentPage: figma.currentPage.name,
    fileKey: figma.fileKey ?? null,
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
