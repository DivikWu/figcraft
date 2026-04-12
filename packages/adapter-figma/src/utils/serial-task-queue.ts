export interface SerialTaskQueueCallbacks<TItem, TResult> {
  onStart?: (item: TItem, queuedCount: number) => void | Promise<void>;
  run: (item: TItem) => Promise<TResult>;
  getTimeoutMs?: (item: TItem) => number | undefined;
  /**
   * Maximum time (ms) to wait for a timed-out handler to settle before
   * force-releasing the processing lock.  Prevents the queue from being
   * permanently blocked when a Figma API call never resolves.
   * Default: 5 000 ms.
   */
  settleTimeoutMs?: number;
  /** Return true if the item should be placed in the high-priority lane. */
  isHighPriority?: (item: TItem) => boolean;
  onResult: (item: TItem, result: TResult) => void | Promise<void>;
  onError: (item: TItem, error: unknown) => void | Promise<void>;
  onTimeout: (item: TItem, timeoutMs: number) => void | Promise<void>;
  onLateError?: (item: TItem, error: unknown) => void | Promise<void>;
}

export interface SerialTaskQueue<TItem> {
  enqueue: (item: TItem) => void;
  pendingCount: () => number;
  isProcessing: () => boolean;
}

const DEFAULT_SETTLE_TIMEOUT_MS = 5_000;

export function createSerialTaskQueue<TItem, TResult>(
  callbacks: SerialTaskQueueCallbacks<TItem, TResult>,
): SerialTaskQueue<TItem> {
  const highQueue: TItem[] = [];
  const normalQueue: TItem[] = [];
  let processing = false;
  const settleMs = callbacks.settleTimeoutMs ?? DEFAULT_SETTLE_TIMEOUT_MS;

  async function invokeSafely(fn: () => void | Promise<void>, label: string): Promise<void> {
    try {
      await fn();
    } catch (error) {
      console.warn(
        `[figcraft] serial-task-queue ${label} failed:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /** Dequeue the next item: high-priority first, then normal. */
  function dequeue(): TItem | undefined {
    if (highQueue.length > 0) return highQueue.shift();
    return normalQueue.shift();
  }

  function totalPending(): number {
    return highQueue.length + normalQueue.length;
  }

  async function processNext(): Promise<void> {
    if (processing || totalPending() === 0) return;
    processing = true;

    const item = dequeue()!;

    try {
      await callbacks.onStart?.(item, totalPending());

      const taskOutcome = callbacks.run(item).then(
        (result) => ({ kind: 'result' as const, result }),
        (error) => ({ kind: 'error' as const, error }),
      );

      const timeoutMs = callbacks.getTimeoutMs?.(item);
      let outcome: { kind: 'result'; result: TResult } | { kind: 'error'; error: unknown } | { kind: 'timeout' };

      if (timeoutMs != null) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          outcome = await Promise.race([
            taskOutcome,
            new Promise<{ kind: 'timeout' }>((resolve) => {
              timer = setTimeout(() => resolve({ kind: 'timeout' }), timeoutMs);
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      } else {
        outcome = await taskOutcome;
      }

      if (outcome.kind === 'timeout') {
        // Force-drain safety net: if the handler never settles (e.g. a Figma
        // API call that hangs indefinitely), release the processing lock after
        // settleMs so the queue isn't permanently blocked.
        let settled = false;
        const settleTimer = setTimeout(() => {
          if (!settled) {
            settled = true;
            console.warn(
              `[figcraft] serial-task-queue: timed-out handler did not settle within ${settleMs}ms — force-draining queue`,
            );
            processing = false;
            void processNext();
          }
        }, settleMs);

        taskOutcome
          .then(async (s) => {
            if (s.kind === 'error') {
              await invokeSafely(() => callbacks.onLateError?.(item, s.error), 'onLateError');
            }
          })
          .finally(() => {
            if (!settled) {
              settled = true;
              clearTimeout(settleTimer);
              processing = false;
              void processNext();
            }
          });

        await invokeSafely(() => callbacks.onTimeout(item, timeoutMs!), 'onTimeout');
        return;
      }

      if (outcome.kind === 'error') {
        await invokeSafely(() => callbacks.onError(item, outcome.error), 'onError');
      } else {
        await invokeSafely(() => callbacks.onResult(item, outcome.result), 'onResult');
      }
    } catch (error) {
      await invokeSafely(() => callbacks.onError(item, error), 'onError');
    }

    processing = false;
    void processNext();
  }

  return {
    enqueue(item: TItem): void {
      if (callbacks.isHighPriority?.(item)) {
        highQueue.push(item);
      } else {
        normalQueue.push(item);
      }
      void processNext();
    },
    pendingCount(): number {
      return totalPending();
    },
    isProcessing(): boolean {
      return processing;
    },
  };
}
