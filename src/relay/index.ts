/**
 * WebSocket Relay Server — channel-based pub/sub.
 *
 * Routes messages between MCP Server and Figma Plugin UI iframe.
 * Each Figma document session uses a unique channel ID.
 *
 * Port: 3055 (default), auto-switches to 3056-3060 if occupied.
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { WireMessage, ChannelId } from '../shared/protocol.js';
import { isJoinMessage, isPingMessage, HEARTBEAT_INTERVAL_MS } from '../shared/protocol.js';

const PORT_RANGE = [3055, 3056, 3057, 3058, 3059, 3060];

// When true, allow multiple connections with the same role on a channel (e.g. two IDEs).
// Default: false (evict stale same-role connections to prevent zombie peers).
const ALLOW_MULTI = process.env.FIGCRAFT_RELAY_ALLOW_MULTI === 'true' || process.env.FIGCRAFT_RELAY_ALLOW_MULTI === '1';

/** Maximum concurrent WebSocket connections to prevent resource exhaustion. */
const MAX_CONNECTIONS = parseInt(process.env.FIGCRAFT_RELAY_MAX_CONNECTIONS ?? '50', 10);

interface ChannelMember {
  ws: WebSocket;
  role: 'mcp' | 'plugin';
}

function setupRelay(wss: WebSocketServer): void {
  const channels = new Map<ChannelId, Set<ChannelMember>>();

  wss.on('connection', (ws) => {
    // Reject connections that exceed the limit.
    // Note: wss.clients already includes this socket at the time of the 'connection' event,
    // so we use >= to enforce the limit correctly.
    if (wss.clients.size >= MAX_CONNECTIONS) {
      console.error(`[FigCraft relay] connection rejected — limit of ${MAX_CONNECTIONS} reached`);
      ws.close(4002, 'Too many connections');
      return;
    }

    // Track ALL channels this socket has joined (fixes zombie member bug
    // where only the last-joined channel was cleaned up on disconnect)
    const memberRefs: Array<{ channel: ChannelId; member: ChannelMember }> = [];

    // Heartbeat
    let alive = true;
    ws.on('pong', () => { alive = true; });

    const heartbeat = setInterval(() => {
      if (!alive) {
        ws.terminate();
        return;
      }
      alive = false;
      ws.ping();
    }, HEARTBEAT_INTERVAL_MS);

    ws.on('message', (raw) => {
      let msg: WireMessage;
      try {
        msg = JSON.parse(raw.toString()) as WireMessage;
      } catch {
        return; // ignore malformed
      }

      // Handle join — register this socket to a channel
      if (isJoinMessage(msg)) {
        const member: ChannelMember = { ws, role: msg.role };
        let members = channels.get(msg.channel);
        if (!members) {
          members = new Set();
          channels.set(msg.channel, members);
        }

        // Role isolation: only one member per role per channel (unless ALLOW_MULTI).
        // If a new mcp/plugin joins the same channel, evict the previous one.
        if (!ALLOW_MULTI) {
          for (const existing of members) {
            if (existing.role === msg.role && existing.ws !== ws) {
              console.error(`[FigCraft relay] evicting stale ${msg.role} from channel ${msg.channel}`);
              members.delete(existing);
              try { existing.ws.close(4001, `Replaced by new ${msg.role}`); } catch { /* already closed */ }
              break;
            }
          }
        }

        members.add(member);
        memberRefs.push({ channel: msg.channel, member });
        console.error(`[FigCraft relay] ${msg.role} joined channel ${msg.channel}`);
        return;
      }

      // Handle ping → respond with pong (application-level)
      if (isPingMessage(msg)) {
        ws.send(JSON.stringify({ type: 'pong', channel: msg.channel }));
        return;
      }

      // Forward message to other members of the same channel
      if ('channel' in msg && msg.channel) {
        const members = channels.get(msg.channel);
        if (!members) return;
        const data = raw.toString();
        let forwarded = 0;
        for (const m of members) {
          if (m.ws !== ws && m.ws.readyState === WebSocket.OPEN) {
            try {
              m.ws.send(data);
              forwarded++;
            } catch {
              // Peer socket died between readyState check and send — skip
            }
          }
        }

        // Send NO_PEER error back to sender when a request has no target
        const msgAny = msg as unknown as Record<string, unknown>;
        if (msgAny.type === 'request' && forwarded === 0) {
          try {
            const errPayload = JSON.stringify({
              id: msgAny.id,
              type: 'error',
              channel: msg.channel,
              error: { code: 'NO_PEER', message: `No peer connected on channel "${msg.channel}" to handle ${msgAny.method}` },
            });
            ws.send(errPayload);
          } catch { /* socket may have closed between receive and send */ }
          console.error(`[FigCraft relay] → ${msgAny.method} — no peer on channel "${msg.channel}"`);
        } else if (msgAny.type === 'request') {
          console.error(`[FigCraft relay] → ${msgAny.method} forwarded to ${forwarded} peer(s)`);
        } else if (msgAny.type === 'response' || msgAny.type === 'error') {
          const payloadKB = (data.length / 1024).toFixed(1);
          console.error(`[FigCraft relay] ← ${msgAny.type} (${payloadKB}KB) forwarded to ${forwarded} peer(s)`);
        }
      }
    });

    ws.on('close', () => {
      clearInterval(heartbeat);
      for (const ref of memberRefs) {
        const members = channels.get(ref.channel);
        if (members) {
          members.delete(ref.member);
          if (members.size === 0) {
            channels.delete(ref.channel);
          }
        }
        console.error(`[FigCraft relay] ${ref.member.role} left channel ${ref.channel}`);
      }
    });

    ws.on('error', (err) => {
      console.error('[FigCraft relay] ws error:', err.message);
    });
  });

  wss.on('error', (err) => {
    console.error('[FigCraft relay] server error:', err.message);
  });
}

/** Try to start a WebSocketServer on the given port. Rejects on error (e.g. EADDRINUSE). */
function tryListen(port: number): Promise<WebSocketServer> {
  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({ port });
    wss.on('listening', () => {
      setupRelay(wss);
      resolve(wss);
    });
    wss.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Start the relay server.
 * Tries preferredPort first, then falls back through PORT_RANGE (3055-3060).
 * Returns the WebSocketServer and the actual port used.
 */
export async function startRelay(preferredPort?: number): Promise<{ wss: WebSocketServer; port: number }> {
  const preferred = preferredPort ?? parseInt(process.env.FIGCRAFT_RELAY_PORT ?? '3055', 10);
  const ports = [preferred, ...PORT_RANGE.filter((p) => p !== preferred)];

  for (const port of ports) {
    try {
      const wss = await tryListen(port);
      console.error(`[FigCraft relay] listening on ws://localhost:${port}`);
      return { wss, port };
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        console.error(`[FigCraft relay] port ${port} in use, trying next...`);
        continue;
      }
      throw err;
    }
  }

  throw new Error(`[FigCraft relay] all ports (${PORT_RANGE.join(', ')}) are in use`);
}

// ─── Direct execution (npm run dev:relay) ───

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const isDirectRun = !process.argv[1] || resolve(process.argv[1]) === __filename;
if (isDirectRun) {
  startRelay().then(({ wss }) => {
    process.on('SIGINT', () => {
      console.error('[FigCraft relay] shutting down...');
      wss.close();
      process.exit(0);
    });
  }).catch((err) => {
    console.error('[FigCraft relay] Fatal:', err);
    process.exit(1);
  });
}
