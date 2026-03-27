/**
 * WebSocket Relay Server — channel-based pub/sub.
 *
 * Routes messages between MCP Server and Figma Plugin UI iframe.
 * Each Figma document session uses a unique channel ID.
 *
 * Port: 3055 (default), auto-switches to 3056-3060 if occupied.
 */

import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { WireMessage, ChannelId } from '@figcraft/shared';
import { isJoinMessage, isPingMessage, HEARTBEAT_INTERVAL_MS } from '@figcraft/shared';

const PORT_RANGE = [3055, 3056, 3057, 3058, 3059, 3060];
const RELAY_HOST = process.env.FIGCRAFT_RELAY_HOST ?? '127.0.0.1';

// When true, allow multiple connections with the same role on a channel (e.g. two IDEs).
// Default: false (evict stale same-role connections to prevent zombie peers).
const ALLOW_MULTI = process.env.FIGCRAFT_RELAY_ALLOW_MULTI === 'true' || process.env.FIGCRAFT_RELAY_ALLOW_MULTI === '1';

/** Maximum concurrent WebSocket connections to prevent resource exhaustion. */
const MAX_CONNECTIONS = parseInt(process.env.FIGCRAFT_RELAY_MAX_CONNECTIONS ?? '50', 10);

interface ChannelMember {
  ws: WebSocket;
  role: 'mcp' | 'plugin';
  socketId: string;
  connectedAt: string;
}

interface RelayStats {
  startedAt: number;
  connectionsAccepted: number;
  connectionsRejected: number;
  activeConnections: number;
  peakConnections: number;
  joinEvents: number;
  sameRoleEvictions: number;
  messagesReceived: number;
  messagesForwarded: number;
  requestsForwarded: number;
  requestsNoPeer: number;
  responsesForwarded: number;
  pingFramesHandled: number;
  wsErrors: number;
  serverErrors: number;
}

interface RelayState {
  channels: Map<ChannelId, Set<ChannelMember>>;
  stats: RelayStats;
}

function createRelayState(): RelayState {
  return {
    channels: new Map(),
    stats: {
      startedAt: Date.now(),
      connectionsAccepted: 0,
      connectionsRejected: 0,
      activeConnections: 0,
      peakConnections: 0,
      joinEvents: 0,
      sameRoleEvictions: 0,
      messagesReceived: 0,
      messagesForwarded: 0,
      requestsForwarded: 0,
      requestsNoPeer: 0,
      responsesForwarded: 0,
      pingFramesHandled: 0,
      wsErrors: 0,
      serverErrors: 0,
    },
  };
}

function relayLog(event: string, details: Record<string, unknown> = {}): void {
  const suffix = Object.keys(details).length > 0 ? ` ${JSON.stringify(details)}` : '';
  console.error(`[FigCraft relay] ${event}${suffix}`);
}

function socketReadyStateLabel(ws: WebSocket): string {
  switch (ws.readyState) {
    case WebSocket.CONNECTING:
      return 'CONNECTING';
    case WebSocket.OPEN:
      return 'OPEN';
    case WebSocket.CLOSING:
      return 'CLOSING';
    case WebSocket.CLOSED:
      return 'CLOSED';
    default:
      return `UNKNOWN(${ws.readyState})`;
  }
}

function snapshotChannels(state: RelayState): Array<{
  channel: string;
  memberCount: number;
  roles: string[];
  members: Array<{ socketId: string; role: string; connectedAt: string; readyState: string }>;
}> {
  return [...state.channels.entries()].map(([channel, members]) => ({
    channel,
    memberCount: members.size,
    roles: [...new Set([...members].map((member) => member.role))],
    members: [...members].map((member) => ({
      socketId: member.socketId,
      role: member.role,
      connectedAt: member.connectedAt,
      readyState: socketReadyStateLabel(member.ws),
    })),
  }));
}

function writeJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload, null, 2));
}

function handleObservabilityRequest(
  req: IncomingMessage,
  res: ServerResponse,
  state: RelayState,
  port: number,
): void {
  if (!req.url) {
    writeJson(res, 400, { ok: false, error: 'Missing request URL' });
    return;
  }

  const url = new URL(req.url, `http://${RELAY_HOST}:${port}`);
  if (req.method !== 'GET') {
    writeJson(res, 405, { ok: false, error: 'Method not allowed' });
    return;
  }

  if (url.pathname === '/health') {
    writeJson(res, 200, {
      ok: true,
      port,
      uptimeMs: Date.now() - state.stats.startedAt,
      channels: state.channels.size,
      activeConnections: state.stats.activeConnections,
      peakConnections: state.stats.peakConnections,
      maxConnections: MAX_CONNECTIONS,
      allowMulti: ALLOW_MULTI,
    });
    return;
  }

  if (url.pathname === '/channels') {
    writeJson(res, 200, {
      ok: true,
      count: state.channels.size,
      channels: snapshotChannels(state),
    });
    return;
  }

  if (url.pathname === '/stats') {
    writeJson(res, 200, {
      ok: true,
      stats: {
        ...state.stats,
        uptimeMs: Date.now() - state.stats.startedAt,
        channels: state.channels.size,
      },
    });
    return;
  }

  writeJson(res, 404, { ok: false, error: 'Not found' });
}

let nextSocketId = 1;

function setupRelay(wss: WebSocketServer, state: RelayState): void {
  const channels = state.channels;

  wss.on('connection', (ws) => {
    if (wss.clients.size >= MAX_CONNECTIONS) {
      state.stats.connectionsRejected++;
      relayLog('connection_rejected', { reason: 'max_connections', limit: MAX_CONNECTIONS });
      ws.close(4002, 'Too many connections');
      return;
    }

    const socketId = `sock-${nextSocketId++}`;
    state.stats.connectionsAccepted++;
    state.stats.activeConnections++;
    state.stats.peakConnections = Math.max(state.stats.peakConnections, state.stats.activeConnections);
    relayLog('connection_open', { socketId, activeConnections: state.stats.activeConnections });

    const memberRefs: Array<{ channel: ChannelId; member: ChannelMember }> = [];

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
      state.stats.messagesReceived++;
      let msg: WireMessage;
      try {
        msg = JSON.parse(raw.toString()) as WireMessage;
      } catch {
        return;
      }

      if (isJoinMessage(msg)) {
        state.stats.joinEvents++;
        const member: ChannelMember = {
          ws,
          role: msg.role,
          socketId,
          connectedAt: new Date().toISOString(),
        };
        let members = channels.get(msg.channel);
        if (!members) {
          members = new Set();
          channels.set(msg.channel, members);
        }

        if (!ALLOW_MULTI) {
          for (const existing of members) {
            if (existing.role === msg.role && existing.ws !== ws) {
              state.stats.sameRoleEvictions++;
              const timeSinceConnect = Date.now() - Date.parse(existing.connectedAt);
              relayLog('same_role_eviction', {
                channel: msg.channel,
                role: msg.role,
                replacedSocketId: existing.socketId,
                replacementSocketId: socketId,
                replacedAgeMs: timeSinceConnect,
              });
              if (state.stats.sameRoleEvictions > 3) {
                relayLog('same_role_eviction_warning', {
                  message: 'Frequent evictions detected — likely multiple MCP server instances connecting to the same channel. Check for duplicate figcraft entries in .mcp.json, .kiro/settings/mcp.json, and .vscode/mcp.json.',
                  totalEvictions: state.stats.sameRoleEvictions,
                });
              }
              members.delete(existing);
              try {
                existing.ws.close(4001, `Replaced by new ${msg.role}`);
              } catch {
                // already closed
              }
              break;
            }
          }
        }

        members.add(member);
        memberRefs.push({ channel: msg.channel, member });
        relayLog('channel_join', {
          socketId,
          channel: msg.channel,
          role: msg.role,
          channelPeers: members.size,
        });
        return;
      }

      if (isPingMessage(msg)) {
        state.stats.pingFramesHandled++;
        ws.send(JSON.stringify({ type: 'pong', channel: msg.channel }));
        return;
      }

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

        const msgAny = msg as unknown as Record<string, unknown>;
        if (msgAny.type === 'request' && forwarded === 0) {
          state.stats.requestsNoPeer++;
          try {
            const errPayload = JSON.stringify({
              id: msgAny.id,
              type: 'error',
              channel: msg.channel,
              error: { code: 'NO_PEER', message: `No peer connected on channel "${msg.channel}" to handle ${msgAny.method}` },
            });
            ws.send(errPayload);
          } catch {
            // socket may have closed between receive and send
          }
          relayLog('request_no_peer', {
            socketId,
            channel: msg.channel,
            requestId: msgAny.id,
            method: msgAny.method,
          });
        } else if (msgAny.type === 'request') {
          state.stats.messagesForwarded += forwarded;
          state.stats.requestsForwarded++;
          relayLog('request_forwarded', {
            socketId,
            channel: msg.channel,
            requestId: msgAny.id,
            method: msgAny.method,
            forwardedPeers: forwarded,
          });
        } else if (msgAny.type === 'response' || msgAny.type === 'error') {
          state.stats.messagesForwarded += forwarded;
          state.stats.responsesForwarded++;
          const payloadKB = (data.length / 1024).toFixed(1);
          relayLog('response_forwarded', {
            socketId,
            channel: msg.channel,
            responseType: msgAny.type,
            requestId: msgAny.id,
            payloadKB,
            forwardedPeers: forwarded,
          });
        }
      }
    });

    ws.on('close', () => {
      clearInterval(heartbeat);
      state.stats.activeConnections = Math.max(0, state.stats.activeConnections - 1);
      for (const ref of memberRefs) {
        const members = channels.get(ref.channel);
        if (members) {
          members.delete(ref.member);
          if (members.size === 0) {
            channels.delete(ref.channel);
          }
        }
        relayLog('channel_leave', {
          socketId,
          channel: ref.channel,
          role: ref.member.role,
          activeConnections: state.stats.activeConnections,
        });
      }
    });

    ws.on('error', (err) => {
      state.stats.wsErrors++;
      relayLog('ws_error', { socketId, error: err.message });
    });
  });

  wss.on('error', (err) => {
    state.stats.serverErrors++;
    relayLog('server_error', { error: err.message });
  });
}

function tryListen(port: number): Promise<{ wss: WebSocketServer; server: HttpServer; port: number }> {
  return new Promise((resolve, reject) => {
    const state = createRelayState();
    let resolved = false;
    let wss: WebSocketServer;

    const server = createServer((req, res) => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      handleObservabilityRequest(req, res, state, actualPort);
    });

    wss = new WebSocketServer({ server });
    setupRelay(wss, state);

    server.on('listening', () => {
      resolved = true;
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      resolve({ wss, server, port: actualPort });
    });

    server.on('error', (err) => {
      reject(err);
    });

    server.listen(port, RELAY_HOST);

    wss.on('error', (err) => {
      if (!resolved) {
        reject(err);
      }
    });
  });
}

export async function startRelay(preferredPort?: number): Promise<{ wss: WebSocketServer; server: HttpServer; port: number }> {
  const preferred = preferredPort ?? parseInt(process.env.FIGCRAFT_RELAY_PORT ?? '3055', 10);
  const ports = preferred === 0
    ? [0]
    : [preferred, ...PORT_RANGE.filter((p) => p !== preferred)];

  for (const port of ports) {
    try {
      const runtime = await tryListen(port);
      relayLog('listening', {
        host: RELAY_HOST,
        ws: `ws://${RELAY_HOST}:${runtime.port}`,
        health: `http://${RELAY_HOST}:${runtime.port}/health`,
      });
      return runtime;
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        relayLog('port_in_use', { port });
        continue;
      }
      throw err;
    }
  }

  throw new Error(`[FigCraft relay] all ports (${PORT_RANGE.join(', ')}) are in use`);
}

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const isDirectRun = process.env.FIGCRAFT_RELAY_DIRECT === '1'
  || !process.argv[1]
  || resolve(process.argv[1]) === __filename;
if (isDirectRun) {
  startRelay().then(({ wss, server }) => {
    process.on('SIGINT', () => {
      relayLog('shutdown');
      server.close();
      wss.close();
      process.exit(0);
    });
  }).catch((err) => {
    relayLog('fatal', { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });
}
