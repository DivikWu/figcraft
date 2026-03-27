import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSerialTaskQueue } from '../packages/adapter-figma/src/utils/serial-task-queue.js';

async function flushMicrotasks(rounds = 6): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

async function waitForQueueToIdle(queue: { pendingCount: () => number; isProcessing: () => boolean }, rounds = 20): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await flushMicrotasks();
    if (queue.pendingCount() === 0 && !queue.isProcessing()) return;
  }
}

describe('createSerialTaskQueue', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs queued tasks sequentially', async () => {
    const events: string[] = [];
    const queue = createSerialTaskQueue<string, string>({
      onStart(item) {
        events.push(`start:${item}`);
      },
      async run(item) {
        events.push(`run:${item}`);
        return `done:${item}`;
      },
      onResult(item, result) {
        events.push(`result:${item}:${result}`);
      },
      onError(item, error) {
        events.push(`error:${item}:${String(error)}`);
      },
      onTimeout(item, timeoutMs) {
        events.push(`timeout:${item}:${timeoutMs}`);
      },
    });

    queue.enqueue('a');
    queue.enqueue('b');
    await waitForQueueToIdle(queue);

    expect(events).toEqual([
      'start:a',
      'run:a',
      'result:a:done:a',
      'start:b',
      'run:b',
      'result:b:done:b',
    ]);
  });

  it('does not start the next task until a timed-out task actually settles', async () => {
    vi.useFakeTimers();

    const events: string[] = [];
    let resolveFirst: ((value: string) => void) | undefined;

    const queue = createSerialTaskQueue<string, string>({
      onStart(item) {
        events.push(`start:${item}`);
      },
      run(item) {
        events.push(`run:${item}`);
        if (item === 'first') {
          return new Promise<string>((resolve) => {
            resolveFirst = resolve;
          });
        }
        return Promise.resolve(`done:${item}`);
      },
      getTimeoutMs(item) {
        return item === 'first' ? 100 : 1_000;
      },
      onResult(item, result) {
        events.push(`result:${item}:${result}`);
      },
      onError(item, error) {
        events.push(`error:${item}:${String(error)}`);
      },
      onTimeout(item, timeoutMs) {
        events.push(`timeout:${item}:${timeoutMs}`);
      },
    });

    queue.enqueue('first');
    queue.enqueue('second');

    await vi.advanceTimersByTimeAsync(100);
    await flushMicrotasks();

    expect(events).toContain('timeout:first:100');
    expect(events).not.toContain('start:second');

    resolveFirst?.('done:first');
    await vi.advanceTimersByTimeAsync(0);
    await flushMicrotasks();

    expect(events).toContain('start:second');
    expect(events).toContain('result:second:done:second');
  });

  it('reports late errors from timed-out tasks and then continues draining', async () => {
    vi.useFakeTimers();

    const events: string[] = [];
    let rejectFirst: ((error?: unknown) => void) | undefined;

    const queue = createSerialTaskQueue<string, string>({
      onStart(item) {
        events.push(`start:${item}`);
      },
      run(item) {
        if (item === 'first') {
          return new Promise<string>((_, reject) => {
            rejectFirst = reject;
          });
        }
        return Promise.resolve(`done:${item}`);
      },
      getTimeoutMs() {
        return 50;
      },
      onResult(item, result) {
        events.push(`result:${item}:${result}`);
      },
      onError(item, error) {
        events.push(`error:${item}:${String(error)}`);
      },
      onTimeout(item) {
        events.push(`timeout:${item}`);
      },
      onLateError(item, error) {
        events.push(`late-error:${item}:${error instanceof Error ? error.message : String(error)}`);
      },
    });

    queue.enqueue('first');
    queue.enqueue('second');

    await vi.advanceTimersByTimeAsync(50);
    expect(events).toContain('timeout:first');
    expect(events).not.toContain('start:second');

    rejectFirst?.(new Error('boom'));
    await vi.advanceTimersByTimeAsync(0);
    await flushMicrotasks();

    expect(events).toContain('late-error:first:boom');
    expect(events).toContain('start:second');
    expect(events).toContain('result:second:done:second');
  });
});

describe('priority queue', () => {
  it('processes high-priority items before normal items', async () => {
    const events: string[] = [];
    let resolveFirst: (() => void) | undefined;

    const queue = createSerialTaskQueue<{ name: string; priority: boolean }, string>({
      onStart(item) {
        events.push(`start:${item.name}`);
      },
      run(item) {
        if (item.name === 'blocking') {
          return new Promise<string>((resolve) => {
            resolveFirst = () => resolve('done:blocking');
          });
        }
        return Promise.resolve(`done:${item.name}`);
      },
      isHighPriority(item) {
        return item.priority;
      },
      onResult(item, result) {
        events.push(`result:${item.name}:${result}`);
      },
      onError(item, error) {
        events.push(`error:${item.name}:${String(error)}`);
      },
      onTimeout(item, timeoutMs) {
        events.push(`timeout:${item.name}:${timeoutMs}`);
      },
    });

    // Enqueue a blocking task first
    queue.enqueue({ name: 'blocking', priority: false });
    // Then enqueue normal + high priority while blocking is running
    await flushMicrotasks();
    queue.enqueue({ name: 'normal-1', priority: false });
    queue.enqueue({ name: 'high-1', priority: true });
    queue.enqueue({ name: 'normal-2', priority: false });

    // Unblock the first task
    resolveFirst?.();
    await waitForQueueToIdle(queue);

    // After blocking completes, high-1 should run before normal-1 and normal-2
    const startEvents = events.filter((e) => e.startsWith('start:'));
    expect(startEvents).toEqual([
      'start:blocking',
      'start:high-1',
      'start:normal-1',
      'start:normal-2',
    ]);
  });

  it('works without isHighPriority callback (all items go to normal queue)', async () => {
    const events: string[] = [];
    const queue = createSerialTaskQueue<string, string>({
      async run(item) {
        return `done:${item}`;
      },
      onResult(item, result) {
        events.push(`result:${item}:${result}`);
      },
      onError() {},
      onTimeout() {},
    });

    queue.enqueue('a');
    queue.enqueue('b');
    await waitForQueueToIdle(queue);

    expect(events).toEqual([
      'result:a:done:a',
      'result:b:done:b',
    ]);
  });
});
