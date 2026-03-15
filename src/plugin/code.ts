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

registerHandler('get_document_info', async () => {
  return {
    name: figma.root.name,
    currentPage: figma.currentPage.name,
    pages: figma.root.children.map((p) => ({ id: p.id, name: p.name })),
  };
});

registerHandler('get_selection', async () => {
  const selection = figma.currentPage.selection;
  return {
    count: selection.length,
    nodes: selection.map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type,
    })),
  };
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
