import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { startRelay } from '../../packages/relay/src/index.js';

type RelayRuntime = Awaited<ReturnType<typeof startRelay>>;

const runtimes: RelayRuntime[] = [];

function openSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function waitForClose(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    ws.once('close', () => resolve());
    ws.close();
  });
}

async function closeRuntime(runtime: RelayRuntime): Promise<void> {
  await new Promise<void>((resolve) => runtime.wss.close(() => resolve()));
  await new Promise<void>((resolve, reject) => {
    runtime.server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

afterEach(async () => {
  while (runtimes.length > 0) {
    const runtime = runtimes.pop();
    if (!runtime) continue;
    await closeRuntime(runtime);
  }
});

describe('relay observability endpoints', () => {
  it('serves health, channels, and stats snapshots on the relay port', async () => {
    const runtime = await startRelay(0);
    runtimes.push(runtime);

    const baseUrl = `http://127.0.0.1:${runtime.port}`;
    const wsUrl = `ws://127.0.0.1:${runtime.port}`;

    const healthBefore = await fetch(`${baseUrl}/health`).then((res) => res.json()) as Record<string, unknown>;
    expect(healthBefore.ok).toBe(true);
    expect(healthBefore.port).toBe(runtime.port);
    expect(healthBefore.channels).toBe(0);

    const mcp = await openSocket(wsUrl);
    const plugin = await openSocket(wsUrl);

    mcp.send(JSON.stringify({ type: 'join', channel: 'design-test', role: 'mcp' }));
    plugin.send(JSON.stringify({ type: 'join', channel: 'design-test', role: 'plugin' }));

    await new Promise((resolve) => setTimeout(resolve, 25));

    const channels = await fetch(`${baseUrl}/channels`).then((res) => res.json()) as {
      ok: boolean;
      count: number;
      channels: Array<{ channel: string; memberCount: number; roles: string[] }>;
    };
    expect(channels.ok).toBe(true);
    expect(channels.count).toBe(1);
    expect(channels.channels[0]?.channel).toBe('design-test');
    expect(channels.channels[0]?.memberCount).toBe(2);
    expect(channels.channels[0]?.roles).toEqual(expect.arrayContaining(['mcp', 'plugin']));

    const stats = await fetch(`${baseUrl}/stats`).then((res) => res.json()) as {
      ok: boolean;
      stats: Record<string, number>;
    };
    expect(stats.ok).toBe(true);
    expect(stats.stats.connectionsAccepted).toBeGreaterThanOrEqual(2);
    expect(stats.stats.joinEvents).toBeGreaterThanOrEqual(2);
    expect(stats.stats.activeConnections).toBeGreaterThanOrEqual(2);

    await Promise.all([waitForClose(mcp), waitForClose(plugin)]);
  });
});
