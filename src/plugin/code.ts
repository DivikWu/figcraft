/**
 * Figma Plugin sandbox entry — code.js
 *
 * Receives commands from UI iframe via postMessage,
 * executes Figma Plugin API calls, and returns results.
 */

// Show the UI (establishes WebSocket connection to relay)
figma.showUI(__html__, { visible: true, width: 320, height: 400 });

// ─── Command handler registry ───

type CommandHandler = (params: Record<string, unknown>) => Promise<unknown>;
const handlers = new Map<string, CommandHandler>();

/** Register a command handler. */
export function registerHandler(method: string, handler: CommandHandler): void {
  handlers.set(method, handler);
}

// ─── Built-in handlers ───

registerHandler('ping', async () => {
  return {
    status: 'ok',
    documentName: figma.root.name,
    currentPage: figma.currentPage.name,
    timestamp: Date.now(),
  };
});

// ─── Import P1 handlers (side-effect registration) ───

import './handlers/nodes.js';
import './handlers/variables.js';
import './handlers/styles.js';
import './handlers/library.js';
import './handlers/export.js';

// ─── Import P2 handlers (side-effect registration) ───

import './handlers/write-nodes.js';
import './handlers/write-variables.js';
import './handlers/write-styles.js';
import './handlers/components.js';
import './handlers/storage.js';

// ─── Import P3 handlers (side-effect registration) ───

import './handlers/lint.js';

// ─── Import P4 handlers (side-effect registration) ───

import './handlers/scan.js';

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
