/**
 * WebSocket message protocol between MCP Server ↔ Relay ↔ Figma Plugin.
 *
 * Flow:
 *   MCP Server → (WS) → Relay → (WS) → Plugin UI iframe → (postMessage) → Plugin code.js
 *   Plugin code.js → (postMessage) → Plugin UI iframe → (WS) → Relay → (WS) → MCP Server
 */

/** Unique request identifier for tracking request/response pairs. */
export type RequestId = string;

/** Channel identifier — one per Figma document session. */
export type ChannelId = string;

// ─── Wire messages (over WebSocket + postMessage) ───

export interface RequestMessage {
  id: RequestId;
  type: 'request';
  channel: ChannelId;
  method: string;
  params: Record<string, unknown>;
}

export interface ResponseMessage {
  id: RequestId;
  type: 'response';
  channel: ChannelId;
  result: unknown;
}

export interface ErrorMessage {
  id: RequestId;
  type: 'error';
  channel: ChannelId;
  error: { code: string; message: string; details?: unknown };
}

export interface JoinMessage {
  type: 'join';
  channel: ChannelId;
  role: 'mcp' | 'plugin';
}

export interface PingMessage {
  type: 'ping';
  channel: ChannelId;
}

export interface PongMessage {
  type: 'pong';
  channel: ChannelId;
}

export type WireMessage =
  | RequestMessage
  | ResponseMessage
  | ErrorMessage
  | JoinMessage
  | PingMessage
  | PongMessage;

// ─── Helpers ───

export function isRequestMessage(msg: unknown): msg is RequestMessage {
  return isObject(msg) && msg.type === 'request';
}

export function isResponseMessage(msg: unknown): msg is ResponseMessage {
  return isObject(msg) && msg.type === 'response';
}

export function isErrorMessage(msg: unknown): msg is ErrorMessage {
  return isObject(msg) && msg.type === 'error';
}

export function isJoinMessage(msg: unknown): msg is JoinMessage {
  return isObject(msg) && msg.type === 'join';
}

export function isPingMessage(msg: unknown): msg is PingMessage {
  return isObject(msg) && msg.type === 'ping';
}

export function isPongMessage(msg: unknown): msg is PongMessage {
  return isObject(msg) && msg.type === 'pong';
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && 'type' in v;
}

/** Generate a UUID v4 request ID. */
export function generateId(): RequestId {
  return crypto.randomUUID();
}

/** Default timeout for a request awaiting response (ms). */
export const REQUEST_TIMEOUT_MS = 30_000;

/** Heartbeat interval (ms). */
export const HEARTBEAT_INTERVAL_MS = 30_000;
