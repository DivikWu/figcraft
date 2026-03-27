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

export interface SetApiTokenMessage {
  type: 'set-api-token';
  channel: ChannelId;
  token: string;
}

export interface SetLibraryFileKeyMessage {
  type: 'set-library-file-key';
  channel: ChannelId;
  library: string;
  fileKey: string;
}

export interface ResolveFileNameMessage {
  type: 'resolve-file-name';
  channel: ChannelId;
  fileKey: string;
  url: string;
}

export interface FileNameResolvedMessage {
  type: 'file-name-resolved';
  channel: ChannelId;
  fileKey: string;
  url: string;
  name: string | null;
  error?: string;
}

export interface ChannelAnnounceMessage {
  type: 'channel-announce';
  channel: ChannelId;
  designChannel: ChannelId;
}

/** Progress message sent by the plugin during long-running operations. */
export interface CommandProgressMessage {
  type: 'command_progress';
  channel: ChannelId;
  /** The request ID this progress belongs to — used to extend the pending request timeout. */
  commandId: RequestId;
  current: number;
  total: number;
  name?: string;
}

export type WireMessage =
  | RequestMessage
  | ResponseMessage
  | ErrorMessage
  | JoinMessage
  | PingMessage
  | PongMessage
  | SetApiTokenMessage
  | SetLibraryFileKeyMessage
  | ResolveFileNameMessage
  | FileNameResolvedMessage
  | ChannelAnnounceMessage
  | CommandProgressMessage;

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

export function isSetApiTokenMessage(msg: unknown): msg is SetApiTokenMessage {
  return isObject(msg) && msg.type === 'set-api-token';
}

export function isSetLibraryFileKeyMessage(msg: unknown): msg is SetLibraryFileKeyMessage {
  return isObject(msg) && msg.type === 'set-library-file-key';
}

export function isResolveFileNameMessage(msg: unknown): msg is ResolveFileNameMessage {
  return isObject(msg) && msg.type === 'resolve-file-name';
}

export function isChannelAnnounceMessage(msg: unknown): msg is ChannelAnnounceMessage {
  return isObject(msg) && msg.type === 'channel-announce';
}

export function isCommandProgressMessage(msg: unknown): msg is CommandProgressMessage {
  return isObject(msg) && msg.type === 'command_progress';
}

/** Fixed control channel for cross-channel coordination. */
export const CONTROL_CHANNEL: ChannelId = '__control__';

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
