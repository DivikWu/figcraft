/**
 * Figma Plugin sandbox entry — code.js
 *
 * Receives commands from UI iframe via postMessage,
 * executes Figma Plugin API calls, and returns results.
 */

import { LOCAL_LIBRARY, PLUGIN_VERSION, STORAGE_KEYS } from './constants.js';
import { registerAnnotationHandlers } from './handlers/annotations.js';
import { registerComponentHandlers } from './handlers/components.js';
// ─── P7 handlers (execute JS) ───
import { registerExecuteJsHandler } from './handlers/execute-js.js';
import { registerExportHandlers } from './handlers/export.js';
// ─── P5b handlers (icon SVG) ───
import { registerIconSvgHandler } from './handlers/icon-svg.js';
// ─── P5 handlers (image/vector) ───
import { registerImageVectorHandlers } from './handlers/image-vector.js';
import { registerLibraryHandlers } from './handlers/library.js';
// ─── P3 handlers (lint) ───
import { registerLintHandlers } from './handlers/lint.js';
// ─── P1 handlers (read) ───
import { registerNodeHandlers } from './handlers/nodes.js';
import { registerPageHandlers } from './handlers/pages.js';
// ─── P6 handlers (prototype) ───
import { registerPrototypeHandlers } from './handlers/prototype.js';
// ─── P4 handlers (scan) ───
import { registerScanHandlers } from './handlers/scan.js';
// ─── P8 handlers (design system search) ───
import { registerSearchDesignSystemHandler } from './handlers/search-design-system.js';
import { registerSelectionHandlers } from './handlers/selection.js';
// ─── Staging handlers ───
import { clearStagedCache, registerStagingHandlers } from './handlers/staging.js';
import { registerStorageHandlers } from './handlers/storage.js';
import { registerStyleHandlers } from './handlers/styles.js';
import { registerVariableHandlers } from './handlers/variables.js';
// ─── P2 handlers (write) ───
import { registerWriteNodeHandlers } from './handlers/write-nodes.js';
import { registerCreateHandlers } from './handlers/write-nodes-create.js';
import { registerInstanceHandlers } from './handlers/write-nodes-instance.js';
import { registerWriteStyleHandlers } from './handlers/write-styles.js';
import { registerWriteVariableHandlers } from './handlers/write-variables.js';
import { handlers, registerHandler } from './registry.js';
import { clearAllCaches } from './utils/cache-manager.js';
import {
  getAvailableLibraryCollectionsCached,
  getLibraryDesignContext,
  getLocalDesignContext,
} from './utils/design-context.js';
import { HandlerError } from './utils/handler-error.js';
import { createSerialTaskQueue } from './utils/serial-task-queue.js';
import { ensureLoaded, getRegisteredStylesSummary } from './utils/style-registry.js';

// ─── Register all handlers ───
registerNodeHandlers();
registerVariableHandlers();
registerStyleHandlers();
registerLibraryHandlers();
registerExportHandlers();
registerWriteNodeHandlers();
registerCreateHandlers();
registerInstanceHandlers();
registerWriteVariableHandlers();
registerWriteStyleHandlers();
registerComponentHandlers();
registerStorageHandlers();
registerPageHandlers();
registerSelectionHandlers();
registerLintHandlers();
registerAnnotationHandlers();
registerPrototypeHandlers();
registerStagingHandlers();
registerScanHandlers();
registerImageVectorHandlers();
registerIconSvgHandler();
registerExecuteJsHandler();
registerSearchDesignSystemHandler();

// ─── Page change safety: clear staging cache to prevent cross-page leaks ───
figma.on('currentpagechange', () => {
  clearStagedCache();
});

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
interface LibraryEntry {
  name: string;
  url: string;
  variableLibraryName?: string;
}

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

// Dedup: if sendLibraryList is already running, reuse the inflight promise
let _sendLibraryListInflight: Promise<void> | null = null;

async function sendLibraryList() {
  if (_sendLibraryListInflight) return _sendLibraryListInflight;
  _sendLibraryListInflight = _sendLibraryListImpl().finally(() => {
    _sendLibraryListInflight = null;
  });
  return _sendLibraryListInflight;
}

async function _sendLibraryListImpl() {
  const entries = await getLibraryEntries();
  const libraries = Object.entries(entries).map(([fileKey, entry]) => ({
    name: entry.name,
    fileKey,
  }));
  const savedLibrary = await figma.clientStorage.getAsync(LIBRARY_STORAGE_KEY);

  // Detect local styles/variables — run in parallel
  const [localCollections, localPaintStyles, localTextStyles, localEffectStyles] = await Promise.all([
    figma.variables.getLocalVariableCollectionsAsync(),
    figma.getLocalPaintStylesAsync(),
    figma.getLocalTextStylesAsync(),
    figma.getLocalEffectStylesAsync(),
  ]);
  const hasLocal =
    localCollections.length > 0 ||
    localPaintStyles.length > 0 ||
    localTextStyles.length > 0 ||
    localEffectStyles.length > 0;

  // Detect which libraries have variables imported into the current file
  // Wrap with a 8s timeout to prevent blocking the UI message handler
  let inUseLibraries: string[] = [];
  try {
    const availableCollections = await getAvailableLibraryCollectionsCached();
    const remoteCollectionKeys = new Set(localCollections.filter((c) => c.remote).map((c) => c.key));
    inUseLibraries = [
      ...new Set(availableCollections.filter((c) => remoteCollectionKeys.has(c.key)).map((c) => c.libraryName)),
    ];
    // ─── Auto-sync library names ───
    // When a library file is renamed after being added, the stored name becomes stale.
    // Detect mismatches and update the variableLibraryName field for accurate variable matching.
    const apiLibraryNames = [...new Set(availableCollections.map((c) => c.libraryName))];
    let nameUpdated = false;
    for (const [, entry] of Object.entries(entries)) {
      // If we already have a variableLibraryName, check if it's still valid
      if (entry.variableLibraryName && !apiLibraryNames.includes(entry.variableLibraryName)) {
        entry.variableLibraryName = undefined;
        nameUpdated = true;
      }
      // If no variableLibraryName yet, try exact match by entry.name
      if (!entry.variableLibraryName && apiLibraryNames.includes(entry.name)) {
        entry.variableLibraryName = entry.name;
        nameUpdated = true;
      }
    }
    if (nameUpdated) {
      await figma.clientStorage.setAsync(LIBRARY_URLS_STORAGE_KEY, entries);
    }
  } catch (err) {
    console.warn('[figcraft] sendLibraryList: failed to get available collections:', err);
  }

  figma.ui.postMessage({
    type: 'library-list',
    libraries,
    inUseLibraries,
    savedLibrary: savedLibrary || null,
    hasLocal,
  });
}

figma.ui.on(
  'message',
  async (msg: {
    type: string;
    channelId?: string;
    mode?: string;
    library?: string;
    token?: string;
    fileKey?: string;
    name?: string;
    url?: string;
    libraryName?: string;
    violations?: unknown[];
  }) => {
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
        const fcIdx = existing.findIndex((a) => a.label.startsWith('[FigCraft]') || a.label.startsWith('[figcraft]'));
        if (fcIdx >= 0) {
          // Extract existing tips and merge with new one
          const oldLabel = existing[fcIdx].label.replace(/^\[FigCraft\]\s*/, '').replace(/^\[figcraft\]\s*/, '');
          const oldTips = oldLabel.split(' · ').filter(Boolean);
          if (!oldTips.includes(v.suggestion)) {
            oldTips.push(v.suggestion);
          }
          const merged = [...existing];
          merged[fcIdx] = { label: `[FigCraft] ${oldTips.join(' · ')}` };
          sn.annotations = merged;
        } else {
          sn.annotations = [...existing, { label: `[FigCraft] ${v.suggestion}` }];
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
          const tips = body.split(' · ').filter((t) => t !== suggestion);
          if (tips.length > 0) {
            updated.push({ label: `[FigCraft] ${tips.join(' · ')}` });
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
          sn.annotations = (sn.annotations || []).filter((a) => !a.label || a.label.indexOf('[FigCraft]') !== 0);
          if (sn.annotations.length < before) cleared++;
        }
        if ('children' in node) {
          for (const child of (node as ChildrenMixin).children) {
            walkClear(child as SceneNode);
          }
        }
      }
      // Scope: selection first, fallback to current page
      const targets =
        figma.currentPage.selection.length > 0 ? [...figma.currentPage.selection] : [...figma.currentPage.children];
      for (const node of targets) {
        walkClear(node);
      }
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
        figma.ui.postMessage({
          type: 'lint-result',
          report: { summary: { total: 0, pass: 0, violations: 0 }, categories: [] },
          error: err instanceof Error ? err.message : String(err),
        });
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
        figma.ui.postMessage({
          type: 'lint-fix-result',
          result: { fixed: 0, failed: 0 },
          error: err instanceof Error ? err.message : String(err),
        });
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
      clearAllCaches();
    } else if (msg.type === 'get-library') {
      const saved = await figma.clientStorage.getAsync(LIBRARY_STORAGE_KEY);
      figma.ui.postMessage({ type: 'restore-library', library: saved || null });
    } else if (msg.type === 'save-library') {
      await figma.clientStorage.setAsync(LIBRARY_STORAGE_KEY, msg.library || '');
      clearAllCaches();
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
        // Resolve the variable API library name — it may differ from the file name
        // (e.g. when a file is duplicated, variables may retain the original library name)
        try {
          const availCols = await getAvailableLibraryCollectionsCached();
          const apiNames = [...new Set(availCols.map((c) => c.libraryName))];
          // 1. Try exact match first
          const exactMatch = apiNames.find((n) => n === name);
          if (exactMatch) {
            entries[fk].variableLibraryName = exactMatch;
          } else {
            // 2. Elimination: remove API names already claimed by other entries,
            //    if exactly one unclaimed name remains, it must be this library.
            const claimedNames = new Set(
              Object.entries(entries)
                .filter(([key, e]) => key !== fk && e.variableLibraryName)
                .map(([, e]) => e.variableLibraryName!),
            );
            const unclaimed = apiNames.filter((n) => !claimedNames.has(n));
            if (unclaimed.length === 1) {
              entries[fk].variableLibraryName = unclaimed[0];
              console.warn(`[figcraft] Resolved variableLibraryName by elimination: "${name}" → "${unclaimed[0]}"`);
            }
          }
        } catch {
          /* timeout or error — skip, will be resolved on next sendLibraryList */
        }
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
  },
);

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
  let libraryFileKey: string | null = null;

  if (mode === 'library' && library) {
    try {
      // Race design context loading against a 10s timeout to prevent hanging
      // Clean up timer on resolve to avoid leaks
      const contextPromise = library === LOCAL_LIBRARY ? getLocalDesignContext() : getLibraryDesignContext(library);
      let contextTimer: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<null>((resolve) => {
        contextTimer = setTimeout(() => resolve(null), 10_000);
      });
      const result = await Promise.race([contextPromise.finally(() => clearTimeout(contextTimer!)), timeoutPromise]);

      if (result) {
        designContext = result;
        // Include registered styles summary (with its own timeout)
        try {
          let stylesTimer: ReturnType<typeof setTimeout>;
          const registered = await Promise.race([
            getRegisteredStylesSummary(library).finally(() => clearTimeout(stylesTimer!)),
            new Promise<null>((resolve) => {
              stylesTimer = setTimeout(() => resolve(null), 5_000);
            }),
          ]);
          if (registered) {
            const MAX_STYLE_SAMPLES = 20;
            const textArr = registered.textStyles.map((s: { name: string; fontSize: number; fontFamily: string }) => ({
              name: s.name,
              fontSize: s.fontSize,
              fontFamily: s.fontFamily,
            }));
            const paintArr = registered.paintStyles.map((s: { name: string; hex: string }) => ({
              name: s.name,
              hex: s.hex,
            }));
            const effectArr = registered.effectStyles.map((s: { name: string; effectType: string }) => ({
              name: s.name,
              effectType: s.effectType,
            }));
            designContext.registeredStyles = {
              textStyleCount: textArr.length,
              textStyles: textArr.slice(0, MAX_STYLE_SAMPLES),
              paintStyleCount: paintArr.length,
              paintStyles: paintArr.slice(0, MAX_STYLE_SAMPLES),
              effectStyleCount: effectArr.length,
              effectStyles: effectArr.slice(0, MAX_STYLE_SAMPLES),
              ...(textArr.length > MAX_STYLE_SAMPLES ||
              paintArr.length > MAX_STYLE_SAMPLES ||
              effectArr.length > MAX_STYLE_SAMPLES
                ? {
                    _note: `Showing first ${MAX_STYLE_SAMPLES} per type. Use search_design_system(query) to find specific styles.`,
                  }
                : {}),
            };
          }
        } catch {
          /* styles summary timeout or error — skip */
        }
      } else {
        console.warn('[figcraft] get_mode designContext timed out after 10s');
      }
    } catch (err) {
      console.warn('[figcraft] get_mode designContext failed:', err);
    }

    // Resolve fileKey for the selected library from stored entries
    if (library && library !== LOCAL_LIBRARY) {
      const entries = await getLibraryEntries();
      for (const [fk, entry] of Object.entries(entries)) {
        if (entry.name === library) {
          libraryFileKey = fk;
          break;
        }
      }
    }
  }

  // Fire-and-forget: preheat style registry so first node creation doesn't pay the 0-6s cold start
  if (mode === 'library' && library) {
    ensureLoaded(library).catch(() => {});
  }

  return { mode, selectedLibrary: library || null, designContext, libraryFileKey };
});

registerHandler('set_mode', async (params) => {
  const mode = (params.mode as string) || 'library';
  await figma.clientStorage.setAsync(MODE_STORAGE_KEY, mode);
  clearAllCaches();
  if (params.library !== undefined) {
    await figma.clientStorage.setAsync(LIBRARY_STORAGE_KEY, params.library as string);
    figma.ui.postMessage({ type: 'library-changed', library: params.library });
    clearAllCaches();
  }
  figma.ui.postMessage({ type: 'mode-changed', mode });
  const library = await figma.clientStorage.getAsync(LIBRARY_STORAGE_KEY);
  return { mode, selectedLibrary: library || null };
});

// ─── Auto-Focus ─────────────────────────────────────────────────
// After create/modify commands, auto-select affected nodes and scroll
// viewport to show them. Fire-and-forget — never blocks the response.
// Next command waits for pending focus to complete (serialized).

const SKIP_FOCUS = new Set([
  'ping',
  'join',
  'set_selection',
  'get_current_page',
  'get_document_info',
  'get_selection',
  'get_node_info',
  'get_available_fonts',
  'list_fonts',
  'scan_text_nodes',
  'export_node_as_image',
  'lint_node',
  'lint_check',
  'lint_fix',
  'get_node_variables',
  'set_current_page',
  'search_nodes',
  'get_mode',
  'set_mode',
  'get_channel',
  'join_channel',
  'text_scan',
  'save_version_history',
]);

function extractNodeIds(result: unknown, params: Record<string, unknown>): string[] {
  const ids: string[] = [];
  const r = result as Record<string, unknown> | null;
  if (r?.id && typeof r.id === 'string') ids.push(r.id);
  if (Array.isArray(r?.results)) {
    for (const item of r.results as Array<Record<string, unknown>>) {
      if (item?.id && typeof item.id === 'string') ids.push(item.id);
    }
  }
  if (Array.isArray(r?.items)) {
    for (const item of r.items as Array<Record<string, unknown>>) {
      if (item?.id && typeof item.id === 'string') ids.push(item.id);
    }
  }
  // Fallback: from params (modify commands use patches[].nodeId or items[].nodeId)
  if (ids.length === 0) {
    const sources = [params.patches, params.items].filter(Array.isArray);
    for (const arr of sources) {
      for (const item of arr as Array<Record<string, unknown>>) {
        if (item?.nodeId && typeof item.nodeId === 'string') ids.push(item.nodeId as string);
      }
    }
  }
  return ids;
}

async function autoFocus(nodeIds: string[]): Promise<void> {
  const resolved = await Promise.all(nodeIds.map((id) => figma.getNodeByIdAsync(id).catch(() => null)));
  const nodes = resolved.filter((n): n is SceneNode => n != null && 'x' in n);
  if (nodes.length > 0) {
    figma.currentPage.selection = nodes;
    figma.viewport.scrollAndZoomIntoView(nodes);
  }
}

let pendingAutoFocus: Promise<void> | null = null;

// ─── Message routing ───

/** Safe postMessage with payload size check. Figma postMessage can silently fail on very large payloads. */
function safePostResponse(msg: Record<string, unknown>): void {
  try {
    const payload = JSON.stringify(msg);
    // Figma postMessage has practical limits around 2-4MB; warn and truncate if too large
    if (payload.length > 2_000_000) {
      console.warn(
        `[figcraft] Response payload too large (${(payload.length / 1024 / 1024).toFixed(1)}MB) for method, sending truncated error`,
      );
      figma.ui.postMessage({
        id: msg.id,
        type: 'error',
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: `Response too large (${(payload.length / 1024 / 1024).toFixed(1)}MB). Try using maxDepth=1 or smaller maxNodes to reduce payload size.`,
        },
      });
      return;
    }
    figma.ui.postMessage(msg);
  } catch (err) {
    console.warn('[figcraft] postMessage failed:', err);
    figma.ui.postMessage({
      id: msg.id,
      type: 'error',
      error: {
        code: 'POST_MESSAGE_FAILED',
        message: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

// ─── Sequential request queue ───
// Figma Plugin API is not concurrency-safe — certain operations (e.g.
// node creation, variable writes) can corrupt state when interleaved.
// We serialize handler execution to prevent this.

const MAX_QUEUE_SIZE = 100;
class UnknownMethodError extends Error {
  constructor(method: string) {
    super(`Unknown method: ${method}`);
    this.name = 'UnknownMethodError';
  }
}

type QueuedRequest = {
  id: string;
  method: string;
  params: Record<string, unknown>;
  timeoutMs?: number;
  startedAt?: number;
};

// ─── High-priority methods ───
// These lightweight read-only methods skip ahead of the normal queue
// so they don't get blocked behind long-running operations like lint.
const HIGH_PRIORITY_METHODS = new Set(['ping', 'get_mode', 'get_selection', 'get_document_info', 'list_fonts']);

const requestQueue = createSerialTaskQueue<QueuedRequest, unknown>({
  onStart(item, queuedCount) {
    item.startedAt = Date.now();
    console.log(`[figcraft] → ${item.method} (id=${item.id}) [queue=${queuedCount}]`);
  },
  async run(item) {
    // Wait for any pending auto-focus from the previous command
    // to prevent race conditions with node lookups
    if (pendingAutoFocus) {
      await pendingAutoFocus;
      pendingAutoFocus = null;
    }
    const handler = handlers.get(item.method);
    if (!handler) {
      throw new UnknownMethodError(item.method);
    }
    return handler(item.params);
  },
  getTimeoutMs(item) {
    return item.timeoutMs ?? 25_000;
  },
  isHighPriority(item) {
    return HIGH_PRIORITY_METHODS.has(item.method);
  },
  async onResult(item, result) {
    const elapsed = Date.now() - (item.startedAt ?? Date.now());
    console.log(`[figcraft] ✓ ${item.method} — ${elapsed}ms`);
    safePostResponse({ id: item.id, type: 'response', result });
    // Auto-focus: select + scroll to created/modified nodes (non-blocking)
    if (!SKIP_FOCUS.has(item.method)) {
      const ids = extractNodeIds(result, item.params);
      if (ids.length > 0) {
        pendingAutoFocus = autoFocus(ids).catch(() => {});
      }
    }
  },
  async onError(item, error) {
    const elapsed = Date.now() - (item.startedAt ?? Date.now());
    const isUnknownMethod = error instanceof UnknownMethodError;
    const isHandlerError = error instanceof HandlerError;
    const code = isUnknownMethod ? 'METHOD_NOT_FOUND' : isHandlerError ? (error as HandlerError).code : 'HANDLER_ERROR';
    console.warn(
      `[figcraft] ✗ ${item.method} — ${elapsed}ms — ${error instanceof Error ? error.message : String(error)}`,
    );
    figma.ui.postMessage({
      id: item.id,
      type: 'error',
      error: {
        code,
        message: error instanceof Error ? error.message : String(error),
      },
    });
  },
  async onTimeout(item, timeoutMs) {
    const elapsed = Date.now() - (item.startedAt ?? Date.now());
    console.warn(
      `[figcraft] ✗ ${item.method} — ${elapsed}ms — timed out, waiting for handler to settle before draining queue`,
    );
    figma.ui.postMessage({
      id: item.id,
      type: 'error',
      error: {
        code: 'HANDLER_ERROR',
        message: `Handler ${item.method} timed out after ${timeoutMs}ms`,
      },
    });
  },
  async onLateError(item, error) {
    console.warn(
      `[figcraft] late handler failure for ${item.method}:`,
      error instanceof Error ? error.message : String(error),
    );
  },
});

// ─── Bridge request routing ───
// NOTE: We use figma.ui.on('message', ...) — NOT figma.ui.onmessage = ...
// The setter form overwrites any prior on('message') listeners, which would
// silently break UI-initiated messages (focus-node, annotate, lint UI, etc.).
figma.ui.on(
  'message',
  async (msg: {
    id?: string;
    type: string;
    method?: string;
    params?: Record<string, unknown>;
    _timeoutMs?: number;
  }) => {
    if (msg.type !== 'request') return;
    if (!msg.id || !msg.method) return;

    if (requestQueue.pendingCount() >= MAX_QUEUE_SIZE) {
      figma.ui.postMessage({
        id: msg.id,
        type: 'error',
        error: {
          code: 'QUEUE_FULL',
          message: `Request queue full (${MAX_QUEUE_SIZE}). Wait for pending requests to complete.`,
        },
      });
      return;
    }

    requestQueue.enqueue({ id: msg.id, method: msg.method, params: msg.params ?? {}, timeoutMs: msg._timeoutMs });
  },
);
