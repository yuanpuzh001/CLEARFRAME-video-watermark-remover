import type { NormalizedRegion, ProcessedVideoResult, VideoQueueItem } from "../../types/video";
import type { QueueConcurrency } from "./concurrency";

export type QueueItemProcessor = (
  file: File,
  region: NormalizedRegion,
  onProgress: (progress: number, message: string) => void,
  signal: AbortSignal,
) => Promise<ProcessedVideoResult>;

interface QueueCallbacks {
  onStart: (item: VideoQueueItem) => void;
  onProgress: (item: VideoQueueItem, progress: number, message: string) => void;
  onSuccess: (item: VideoQueueItem, result: ProcessedVideoResult) => void;
  onError: (item: VideoQueueItem, reason: unknown) => void;
  onCancelled: (items: VideoQueueItem[]) => void;
}

function isAbortError(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === "AbortError";
}

export async function runBoundedVideoQueue(
  items: VideoQueueItem[],
  processItem: QueueItemProcessor,
  callbacks: QueueCallbacks,
  signal: AbortSignal,
  concurrency: QueueConcurrency = 1,
): Promise<void> {
  let cursor = 0;
  let stopped = false;
  const settledIndexes = new Set<number>();

  const worker = async () => {
    while (!stopped && !signal.aborted) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      const item = items[index];

      callbacks.onStart(item);
      try {
        const result = await processItem(
          item.asset.file,
          item.region,
          (progress, message) => callbacks.onProgress(item, progress, message),
          signal,
        );
        if (signal.aborted) return;
        callbacks.onSuccess(item, result);
        settledIndexes.add(index);
      } catch (reason) {
        if (signal.aborted || isAbortError(reason)) {
          stopped = true;
          return;
        }
        callbacks.onError(item, reason);
        settledIndexes.add(index);
      }
    }
  };

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  if (signal.aborted || stopped) {
    callbacks.onCancelled(items.filter((_item, index) => !settledIndexes.has(index)));
  }
}

export function runSequentialVideoQueue(
  items: VideoQueueItem[],
  processItem: QueueItemProcessor,
  callbacks: QueueCallbacks,
  signal: AbortSignal,
): Promise<void> {
  return runBoundedVideoQueue(items, processItem, callbacks, signal, 1);
}
