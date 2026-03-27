/**
 * WebSocket bridge client — connects MCP Server to the Relay.
 *
 * Provides request/response tracking with UUID + 30s timeout.
 * Auto-reconnects on disconnect.
 */

import WebSocket from 'ws';
import http from 'node:http';
import type { ChannelId, RequestId } from '@figcraft/shared';
import {
  generateId,
  REQUEST_TIMEOUT_MS,
  HEARTBEAT_INTERVAL_MS,
  CONTROL_CHANNEL,
  isResponseMessage,
  isErrorMessage,
  isPongMessage,
  isSetApiTokenMessage,
  isSetLibraryFileKeyMessage,
  isResolveFileNameMessage,
  isChannelAnnounceMessage,
  isCommandProgressMessage,
} from '@figcraft/shared';
import { fetchFileName } from './figma-api.js';
import { saveBridgeToken } from './auth.js';

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class Bridge {
  private ws: WebSocket | null = null;
  private pending = new Map<RequestId, PendingRequest>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connected = false;
  private connecting = false;
  private apiToken: string | null = null;
  private libraryFileKeys = new Map<string, string>();
  private reconnectAttempts = 0;
  private missedPongs = 0;
  private lastPongTs = 0;
  private connectionWaiters: Array<() => void> = [];
  private intentionalDisconnect = false;
  private static readonly MAX_MISSED_PONGS = 3;
  private static readonly MAX_REQUEST_RECONNECT_ATTEMPTS = 2;

  constructor(
    private relayUrl: string,
    private channel: ChannelId,
  ) {}

  /** Maximum time to wait for a connection to establish (ms). */
  private static readonly CONNECT_TIMEOUT_MS = 15_000;

  /** Connect to the relay and join the channel. */
  async connect(): Promise<void> {
    if (this.connected) return;
    if (this.connecting) return;
    this.connecting = true;
    this.intentionalDisconnect = false;

    // Terminate any lingering previous socket before creating a new one.
    // This prevents same_role_eviction loops where the relay sees two mcp
    // sockets on the same channel (the old one not yet fully closed at TCP level).
    if (this.ws) {
      const oldWs = this.ws;
      this.ws = null;
      try { oldWs.removeAllListeners(); oldWs.terminate(); } catch { /* already closed */ }
    }

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(this.relayUrl);
      this.ws = ws;

      // Guard against connections that never open and never error
      const connectTimeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.connecting = false;
          ws.terminate();
          reject(new Error(`Connection to relay timed out after ${Bridge.CONNECT_TIMEOUT_MS}ms`));
        }
      }, Bridge.CONNECT_TIMEOUT_MS);

      ws.on('open', () => {
        clearTimeout(connectTimeout);
        this.connected = true;
        this.connecting = false;
        this.reconnectAttempts = 0;
        this.missedPongs = 0;
        // Join data channel + control channel
        ws.send(JSON.stringify({ type: 'join', channel: this.channel, role: 'mcp' }));
        ws.send(JSON.stringify({ type: 'join', channel: CONTROL_CHANNEL, role: 'mcp' }));
        this.startHeartbeat();
        this.notifyConnectionWaiters();
        settled = true;
        resolve();
      });

      ws.on('message', (raw) => {
        // Ignore messages from stale sockets
        if (this.ws !== ws) return;
        let msg: unknown;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }

        if (isResponseMessage(msg)) {
          const req = this.pending.get(msg.id);
          if (req) {
            clearTimeout(req.timer);
            this.pending.delete(msg.id);
            req.resolve(msg.result);
          }
          return;
        }

        if (isErrorMessage(msg)) {
          const req = this.pending.get(msg.id);
          if (req) {
            clearTimeout(req.timer);
            this.pending.delete(msg.id);
            req.reject(new Error(`${msg.error.code}: ${msg.error.message}`));
          }
          return;
        }

        if (isPongMessage(msg)) {
          this.missedPongs = 0;
          this.lastPongTs = Date.now();
          return;
        }

        if (isChannelAnnounceMessage(msg)) {
          if (msg.designChannel && msg.designChannel !== this.channel) {
            console.error(`[FigCraft bridge] plugin announced channel "${msg.designChannel}", switching from "${this.channel}"`);
            this.joinChannel(msg.designChannel);
          }
          return;
        }

        // Progress messages extend the timeout of the associated pending request.
        // This prevents long-running operations (e.g. batch node updates)
        // from timing out while the plugin is still actively working.
        if (isCommandProgressMessage(msg)) {
          const req = this.pending.get(msg.commandId);
          if (req) {
            clearTimeout(req.timer);
            req.timer = setTimeout(() => {
              this.pending.delete(msg.commandId);
              console.error(`[FigCraft bridge] ✗ request timed out after progress (id=${msg.commandId.slice(0, 8)})`);
              req.reject(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms (progress was received)`));
            }, REQUEST_TIMEOUT_MS);
          }
          return;
        }

        if (isSetApiTokenMessage(msg)) {
          this.apiToken = msg.token || null;
          if (msg.token) {
            saveBridgeToken(msg.token);
          }
          console.error('[FigCraft bridge] API token received from plugin');
          return;
        }

        if (isSetLibraryFileKeyMessage(msg)) {
          if (msg.fileKey) {
            this.libraryFileKeys.set(msg.library, msg.fileKey);
          } else {
            this.libraryFileKeys.delete(msg.library);
          }
          console.error(`[FigCraft bridge] Library file key ${msg.fileKey ? 'set' : 'cleared'} for "${msg.library}"`);
          return;
        }

        if (isResolveFileNameMessage(msg)) {
          const token = this.apiToken;
          if (!token || !ws) {
            ws?.send(JSON.stringify({ type: 'file-name-resolved', channel: this.channel, fileKey: msg.fileKey, url: msg.url, name: null, error: 'No API token configured' }));
            return;
          }
          fetchFileName(msg.fileKey, token)
            .then((name) => {
              ws.send(JSON.stringify({ type: 'file-name-resolved', channel: this.channel, fileKey: msg.fileKey, url: msg.url, name }));
              this.libraryFileKeys.set(name, msg.fileKey);
              console.error(`[FigCraft bridge] Resolved file name: "${name}" for key ${msg.fileKey}`);
            })
            .catch((err: Error) => {
              ws.send(JSON.stringify({ type: 'file-name-resolved', channel: this.channel, fileKey: msg.fileKey, url: msg.url, name: null, error: err.message }));
            });
          return;
        }
      });

      ws.on('close', (code, reason) => {
        clearTimeout(connectTimeout);
        // Ignore close events from stale sockets replaced by a newer connection.
        if (this.ws !== ws) return;
        // code 4001 = same_role_eviction: this socket was replaced by another MCP
        // instance on the same channel. Do NOT reconnect — it would create an
        // infinite eviction loop. Log a clear warning instead.
        if (code === 4001) {
          console.error(`[FigCraft bridge] evicted by another MCP instance (4001: ${reason?.toString()}). Check for duplicate figcraft server configs in .mcp.json / .kiro/settings/mcp.json / .vscode/mcp.json.`);
          this.connected = false;
          this.connecting = false;
          this.stopHeartbeat();
          this.rejectAllPending('Connection closed');
          if (!this.intentionalDisconnect) {
            this.scheduleReconnect();
          }
          if (!settled) {
            settled = true;
            reject(new Error('Connection closed during handshake'));
          }
          return;
        }
        console.error(`[FigCraft bridge] connection closed (code=${code})`);
        this.connected = false;
        this.connecting = false;
        this.stopHeartbeat();
        this.rejectAllPending('Connection closed');
        if (!this.intentionalDisconnect) {
          this.scheduleReconnect();
        }
        if (!settled) {
          settled = true;
          reject(new Error('Connection closed during handshake'));
        }
      });

      ws.on('error', (err) => {
        clearTimeout(connectTimeout);
        console.error('[FigCraft bridge] ws error:', err.message);
        if (this.ws !== ws) return; // stale socket
        if (!settled) {
          settled = true;
          this.connecting = false;
          reject(err);
        }
      });
    });
  }

  /** Send a request to the Plugin and await its response. */
  async request(method: string, params: Record<string, unknown> = {}, timeoutMs?: number): Promise<unknown> {
    // If disconnected, wait for reconnection (up to 10s)
    if (!this.ws || !this.connected) {
      await this.waitForConnection(10_000);
    }
    // Active reconnection: if still disconnected and not intentionally disconnected,
    // attempt to reconnect (like ping/get_mode do) before giving up.
    if (!this.ws || !this.connected) {
      if (!this.intentionalDisconnect) {
        for (let attempt = 0; attempt < Bridge.MAX_REQUEST_RECONNECT_ATTEMPTS; attempt++) {
          console.error(`[FigCraft bridge] request() triggering active reconnect for ${method} (attempt ${attempt + 1}/${Bridge.MAX_REQUEST_RECONNECT_ATTEMPTS})`);
          try {
            await this.connect();
            await this.discoverPluginChannel();
            if (this.connected) break;
          } catch { /* continue to next attempt */ }
        }
      }
    }
    if (!this.ws || !this.connected || this.ws.readyState !== 1) {
      throw new Error('Bridge not connected');
    }

    const id = generateId();
    const timeout = timeoutMs ?? REQUEST_TIMEOUT_MS;
    const startTime = Date.now();
    console.error(`[FigCraft bridge] → ${method} (id=${id.slice(0, 8)})`);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        const elapsed = Date.now() - startTime;
        console.error(`[FigCraft bridge] ✗ ${method} timed out after ${elapsed}ms (id=${id.slice(0, 8)})`);
        reject(new Error(`Request ${method} timed out after ${timeout}ms`));
      }, timeout);

      this.pending.set(id, {
        resolve: (result: unknown) => {
          const elapsed = Date.now() - startTime;
          console.error(`[FigCraft bridge] ✓ ${method} — ${elapsed}ms (id=${id.slice(0, 8)})`);
          resolve(result);
        },
        reject: (error: Error) => {
          const elapsed = Date.now() - startTime;
          console.error(`[FigCraft bridge] ✗ ${method} — ${elapsed}ms — ${error.message} (id=${id.slice(0, 8)})`);
          reject(error);
        },
        timer,
      });

      try {
        this.ws!.send(
          JSON.stringify({
            id,
            type: 'request',
            channel: this.channel,
            method,
            // Inject _commandId so the plugin can reference it in progress messages.
            // Handlers that don't use it simply ignore the extra field.
            params: { ...params, _commandId: id },
            ...(timeoutMs != null ? { _timeoutMs: timeoutMs } : {}),
          }),
        );
      } catch (sendErr) {
        clearTimeout(timer);
        this.pending.delete(id);
        const elapsed = Date.now() - startTime;
        console.error(`[FigCraft bridge] ✗ ${method} send failed — ${elapsed}ms (id=${id.slice(0, 8)})`);
        reject(sendErr instanceof Error ? sendErr : new Error(String(sendErr)));
      }
    });
  }

  /** Wait for the bridge to reconnect, up to maxWaitMs. */
  private waitForConnection(maxWaitMs: number): Promise<void> {
    if (this.connected) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        // Remove this waiter on timeout
        this.connectionWaiters = this.connectionWaiters.filter((w) => w !== onConnect);
        resolve();
      }, maxWaitMs);
      const onConnect = () => {
        clearTimeout(timer);
        resolve();
      };
      this.connectionWaiters.push(onConnect);
    });
  }

  /** Notify all connection waiters that we're connected. */
  private notifyConnectionWaiters(): void {
    const waiters = this.connectionWaiters;
    this.connectionWaiters = [];
    for (const waiter of waiters) waiter();
  }

  /** Disconnect from the relay. */
  disconnect(): void {
    this.intentionalDisconnect = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.connected = false;
    this.rejectAllPending('Disconnected');
    // Reject any pending connection waiters so they don't hang until timeout
    this.notifyConnectionWaiters();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  get isConnected(): boolean {
    return this.connected;
  }

  get currentChannel(): ChannelId {
    return this.channel;
  }

  /** Update the relay URL (must be called before connect). */
  setRelayUrl(url: string): void {
    this.relayUrl = url;
  }

  /** Get the API token received from Plugin UI (or null). */
  getApiToken(): string | null {
    return this.apiToken;
  }

  /** Get the file key for a library (set from Plugin UI). */
  getLibraryFileKey(library: string): string | null {
    return this.libraryFileKeys.get(library) ?? null;
  }

  /** Set the file key for a library (from plugin response or UI). */
  setLibraryFileKey(library: string, fileKey: string): void {
    this.libraryFileKeys.set(library, fileKey);
  }

  /**
   * Query the Relay's /channels HTTP endpoint to find a channel with an active
   * plugin connection. If found and different from the current channel, auto-switch.
   * This solves the common mismatch where MCP Server starts on one channel but
   * the Figma plugin is on another.
   */
  async discoverPluginChannel(): Promise<void> {
    if (!this.connected) return;

    // Derive HTTP URL from the WebSocket relay URL (same host:port)
    const httpUrl = this.relayUrl.replace(/^ws/, 'http');
    const channelsUrl = `${httpUrl}/channels`;

    try {
      const body = await new Promise<string>((resolve, reject) => {
        const req = http.get(channelsUrl, { timeout: 3000 }, (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      });

      const json = JSON.parse(body) as {
        ok: boolean;
        channels: Array<{
          channel: string;
          roles: string[];
          members: Array<{ role: string }>;
        }>;
      };

      if (!json.ok || !json.channels) return;

      // Find channels that have a plugin member but exclude the control channel
      const pluginChannels = json.channels.filter(
        (ch) => ch.channel !== '__control__' && ch.roles.includes('plugin'),
      );

      if (pluginChannels.length === 0) return;

      // If current channel already has a plugin, no switch needed
      if (pluginChannels.some((ch) => ch.channel === this.channel)) return;

      // Switch to the first channel that has a plugin
      const target = pluginChannels[0].channel;
      console.error(
        `[FigCraft bridge] auto-discovered plugin on channel "${target}", switching from "${this.channel}"`,
      );
      this.joinChannel(target);
    } catch {
      // Discovery is best-effort — silently ignore failures
    }
  }

  /** Switch to a different channel. Re-joins the relay with the new channel. */
  joinChannel(channel: ChannelId): void {
    if (!this.ws || !this.connected) {
      throw new Error('Bridge not connected');
    }
    this.channel = channel;
    this.ws.send(JSON.stringify({ type: 'join', channel: this.channel, role: 'mcp' }));
  }

  // ─── Response size limiting ───

  /** Maximum response size in characters. Responses exceeding this are truncated with guidance. */
  static readonly MAX_RESPONSE_CHARS = 50_000;

  /**
   * Guard a response against excessive size. If the JSON-serialized result exceeds
   * MAX_RESPONSE_CHARS, returns a truncated error with hints for the agent to narrow scope.
   * Otherwise returns the original result unchanged.
   *
   * @param result - The raw result from the plugin
   * @param method - The tool method name (for error context)
   * @param hints - Optional hints for the agent on how to reduce response size
   */
  static guardResponseSize(
    result: unknown,
    method: string,
    hints?: string[],
  ): unknown {
    const json = JSON.stringify(result);
    if (json.length <= Bridge.MAX_RESPONSE_CHARS) return result;

    const sizeKB = Math.round(json.length / 1024);
    const limitKB = Math.round(Bridge.MAX_RESPONSE_CHARS / 1024);
    const defaultHints = [
      'Use maxDepth=1 or maxDepth=2 to limit tree depth',
      'Use nodes(method: "get") on specific nodes instead of fetching the full tree',
      'Use nodes(method: "list") with a query to find specific nodes',
    ];
    return {
      _error: 'response_too_large',
      _sizeKB: sizeKB,
      _limitKB: limitKB,
      method,
      warning: `Response is ${sizeKB}KB, exceeding the ${limitKB}KB limit. The data was truncated to prevent context overflow.`,
      hints: hints ?? defaultHints,
      // Include a truncated preview (first ~10KB) so the agent has some context
      _preview: json.slice(0, 10_000) + '\n... [truncated]',
    };
  }

  // ─── Private ───

  private startHeartbeat(): void {
    this.missedPongs = 0;
    this.lastPongTs = Date.now();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.connected) {
        this.missedPongs++;
        if (this.missedPongs > Bridge.MAX_MISSED_PONGS) {
          // Guard: if we received a pong recently (within 2× heartbeat interval),
          // the relay is alive but pongs are arriving late. Reset instead of terminating.
          const sincePong = Date.now() - this.lastPongTs;
          if (sincePong < HEARTBEAT_INTERVAL_MS * 2) {
            this.missedPongs = 1;
            return;
          }
          console.error(`[FigCraft bridge] relay unresponsive (${this.missedPongs} missed pongs, last pong ${sincePong}ms ago), forcing reconnect`);
          this.ws.terminate();
          return;
        }
        this.ws.send(JSON.stringify({ type: 'ping', channel: this.channel }));
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private rejectAllPending(reason: string): void {
    for (const [id, req] of this.pending) {
      clearTimeout(req.timer);
      req.reject(new Error(reason));
    }
    this.pending.clear();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;    // Exponential backoff: 1s, 2s, 4s, 8s … capped at 60s, with ±20% jitter
    const base = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 60_000);
    const jitter = base * 0.2 * (Math.random() * 2 - 1);
    const delay = Math.round(base + jitter);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      console.error(`[FigCraft bridge] reconnect attempt ${this.reconnectAttempts} (delay was ${delay}ms)...`);
      try {
        await this.connect();
        console.error('[FigCraft bridge] reconnected');
      } catch {
        this.scheduleReconnect();
      }
    }, delay);
  }
}
