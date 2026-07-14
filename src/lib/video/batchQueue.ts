import type { NormalizedRegion, ProcessedVideoResult, VideoQueueItem } from "../../types/video";

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

export async function runSequentialVideoQueue(
  items: VideoQueueItem[],
  processItem: QueueItemProcessor,
  callbacks: QueueCallbacks,
  signal: AbortSignal,
): Promise<void> {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (signal.aborted) {
      callbacks.onCancelled(items.slice(index));
      return;
    }

    callbacks.onStart(item);
    try {
      const result = await processItem(
        item.asset.file,
        item.region,
        (progress, message) => callbacks.onProgress(item, progress, message),
        signal,
      );
      if (signal.aborted) {
        callbacks.onCancelled(items.slice(index));
        return;
      }
      callbacks.onSuccess(item, result);
    } catch (reason) {
      if (signal.aborted || isAbortError(reason)) {
        callbacks.onCancelled(items.slice(index));
        return;
      }
      callbacks.onError(item, reason);
    }
  }
}
