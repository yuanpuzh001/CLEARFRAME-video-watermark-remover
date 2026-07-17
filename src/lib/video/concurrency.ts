export const QUEUE_CONCURRENCY_OPTIONS = [1, 2, 4] as const;

export type QueueConcurrency = typeof QUEUE_CONCURRENCY_OPTIONS[number];

export function isQueueConcurrency(value: unknown): value is QueueConcurrency {
  return typeof value === "number"
    && QUEUE_CONCURRENCY_OPTIONS.includes(value as QueueConcurrency);
}
