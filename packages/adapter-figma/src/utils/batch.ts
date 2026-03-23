/**
 * Batch operation processor — items[] with per-item error handling.
 *
 * Single item failure does not abort the batch.
 */

export interface BatchItemResult<T = unknown> {
  item: T;
  ok: boolean;
  error?: string;
}

export interface BatchResult<T = unknown> {
  success: number;
  failed: number;
  results: BatchItemResult<T>[];
}

/** Process items in batch, catching per-item errors. */
export async function processBatch<T>(
  items: T[],
  handler: (item: T, index: number) => Promise<void>,
): Promise<BatchResult<T>> {
  const results: BatchItemResult<T>[] = [];
  let success = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i++) {
    try {
      await handler(items[i], i);
      results.push({ item: items[i], ok: true });
      success++;
    } catch (err) {
      results.push({
        item: items[i],
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
      failed++;
    }
  }

  return { success, failed, results };
}
