/**
 * WebSocket Relay Server — channel-based pub/sub.
 *
 * Routes messages between MCP Server and Figma Plugin UI iframe.
 * Each Figma document session uses a unique channel ID.
 *
 * Port: 3055 (default)
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { WireMessage, ChannelId } from '../shared/protocol.js';
import { isJoinMessage, isPingMessage, HEARTBEAT_INTERVAL_MS } from '../shared/protocol.js';

const PORT = parseInt(process.env.FIGCRAFT_RELAY_PORT ?? '3055', 10);

interface ChannelMember {
  ws: WebSocket;
  role: 'mcp' | 'plugin';
}

/** channel → set of connected clients */
const channels = new Map<ChannelId, Set<ChannelMember>>();

const wss = new WebSocketServer({ port: PORT });

wss.on('listening', () => {
  console.log(`[figcraft relay] listening on ws://localhost:${PORT}`);
});

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
      console.log(`[figcraft relay] ${msg.role} joined channel ${msg.channel}`);
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
      console.log(`[figcraft relay] ${memberRef.member.role} left channel ${memberRef.channel}`);
    }
  });

  ws.on('error', (err) => {
    console.error('[figcraft relay] ws error:', err.message);
  });
});

wss.on('error', (err) => {
  console.error('[figcraft relay] server error:', err.message);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[figcraft relay] shutting down...');
  wss.close();
  process.exit(0);
});
