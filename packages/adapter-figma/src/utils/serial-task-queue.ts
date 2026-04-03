export interface SerialTaskQueueCallbacks<TItem, TResult> {
  onStart?: (item: TItem, queuedCount: number) => void | Promise<void>;
  run: (item: TItem) => Promise<TResult>;
  getTimeoutMs?: (item: TItem) => number | undefined;
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

export function createSerialTaskQueue<TItem, TResult>(
  callbacks: SerialTaskQueueCallbacks<TItem, TResult>,
): SerialTaskQueue<TItem> {
  const highQueue: TItem[] = [];
  const normalQueue: TItem[] = [];
  let processing = false;

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
        taskOutcome
          .then(async (settled) => {
            if (settled.kind === 'error') {
              await invokeSafely(() => callbacks.onLateError?.(item, settled.error), 'onLateError');
            }
          })
          .finally(() => {
            processing = false;
            void processNext();
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
