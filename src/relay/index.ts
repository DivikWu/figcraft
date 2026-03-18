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

interface ChannelMember {
  ws: WebSocket;
  role: 'mcp' | 'plugin';
}

function setupRelay(wss: WebSocketServer): void {
  const channels = new Map<ChannelId, Set<ChannelMember>>();

  wss.on('connection', (ws) => {
    let memberRef: { channel: ChannelId; member: ChannelMember } | null = null;

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
        members.add(member);
        memberRef = { channel: msg.channel, member };
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
        const data = JSON.stringify(msg);
        for (const m of members) {
          if (m.ws !== ws && m.ws.readyState === WebSocket.OPEN) {
            m.ws.send(data);
          }
        }
      }
    });

    ws.on('close', () => {
      clearInterval(heartbeat);
      if (memberRef) {
        const members = channels.get(memberRef.channel);
        if (members) {
          members.delete(memberRef.member);
          if (members.size === 0) {
            channels.delete(memberRef.channel);
          }
        }
        console.error(`[FigCraft relay] ${memberRef.member.role} left channel ${memberRef.channel}`);
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

const isDirectRun = !process.argv[1] || process.argv[1].includes('relay');
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
