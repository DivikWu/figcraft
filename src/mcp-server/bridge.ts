/**
 * WebSocket bridge client — connects MCP Server to the Relay.
 *
 * Provides request/response tracking with UUID + 30s timeout.
 * Auto-reconnects on disconnect.
 */

import WebSocket from 'ws';
import type { ChannelId, RequestId } from '../shared/protocol.js';
import {
  generateId,
  REQUEST_TIMEOUT_MS,
  HEARTBEAT_INTERVAL_MS,
  isResponseMessage,
  isErrorMessage,
  isPongMessage,
  isSetApiTokenMessage,
} from '../shared/protocol.js';

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
  private apiToken: string | null = null;

  constructor(
    private relayUrl: string,
    private channel: ChannelId,
  ) {}

  /** Connect to the relay and join the channel. */
  async connect(): Promise<void> {
    if (this.connected) return;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.relayUrl);

      this.ws.on('open', () => {
        this.connected = true;
        // Join channel as MCP role
        this.ws!.send(JSON.stringify({ type: 'join', channel: this.channel, role: 'mcp' }));
        this.startHeartbeat();
        resolve();
      });

      this.ws.on('message', (raw) => {
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
          // heartbeat acknowledged
          return;
        }

        if (isSetApiTokenMessage(msg)) {
          this.apiToken = msg.token || null;
          console.error('[FigCraft bridge] API token received from plugin');
          return;
        }
      });

      this.ws.on('close', () => {
        this.connected = false;
        this.stopHeartbeat();
        this.rejectAllPending('Connection closed');
        this.scheduleReconnect();
      });

      this.ws.on('error', (err) => {
        if (!this.connected) {
          reject(err);
        }
        console.error('[FigCraft bridge] ws error:', err.message);
      });
    });
  }

  /** Send a request to the Plugin and await its response. */
  async request(method: string, params: Record<string, unknown> = {}, timeoutMs?: number): Promise<unknown> {
    if (!this.ws || !this.connected) {
      throw new Error('Bridge not connected');
    }

    const id = generateId();
    const timeout = timeoutMs ?? REQUEST_TIMEOUT_MS;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request ${method} timed out after ${timeout}ms`));
      }, timeout);

      this.pending.set(id, { resolve, reject, timer });

      this.ws!.send(
        JSON.stringify({
          id,
          type: 'request',
          channel: this.channel,
          method,
          params,
        }),
      );
    });
  }

  /** Disconnect from the relay. */
  disconnect(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.rejectAllPending('Disconnected');
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
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

  /** Switch to a different channel. Re-joins the relay with the new channel. */
  joinChannel(channel: ChannelId): void {
    if (!this.ws || !this.connected) {
      throw new Error('Bridge not connected');
    }
    this.channel = channel;
    this.ws.send(JSON.stringify({ type: 'join', channel: this.channel, role: 'mcp' }));
  }

  // ─── Private ───

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.connected) {
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
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      console.log('[FigCraft bridge] attempting reconnect...');
      try {
        await this.connect();
        console.log('[FigCraft bridge] reconnected');
      } catch {
        this.scheduleReconnect();
      }
    }, 3000);
  }
}
