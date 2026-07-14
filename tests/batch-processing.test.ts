import { describe, expect, it, vi } from "vitest";
import { runSequentialVideoQueue, type QueueItemProcessor } from "../src/lib/video/batchQueue";
import type { VideoQueueItem } from "../src/types/video";

function makeItem(id: string): VideoQueueItem {
  const file = new File([id], `${id}.mp4`, { type: "video/mp4" });
  return {
    id,
    asset: { file, url: `blob:${id}`, width: 100, height: 100, duration: 1, size: file.size },
    region: { x: 0.8, y: 0.8, width: 0.1, height: 0.1 },
  };
}

describe("runSequentialVideoQueue", () => {
  it("processes one item at a time and continues after an item fails", async () => {
    const events: string[] = [];
    const processItem: QueueItemProcessor = vi.fn(async (file) => {
      events.push(`process:${file.name}`);
      if (file.name === "two.mp4") throw new Error("bad video");
      return { blob: new Blob([file.name]), mode: "browser" as const, outputName: `${file.name}-clean.mp4` };
    });
    const controller = new AbortController();

    await runSequentialVideoQueue(
      [makeItem("one"), makeItem("two"), makeItem("three")],
      processItem,
      {
        onStart: (item) => events.push(`start:${item.id}`),
        onProgress: () => undefined,
        onSuccess: (item) => events.push(`success:${item.id}`),
        onError: (item) => events.push(`error:${item.id}`),
        onCancelled: () => events.push("cancelled"),
      },
      controller.signal,
    );

    expect(events).toEqual([
      "start:one", "process:one.mp4", "success:one",
      "start:two", "process:two.mp4", "error:two",
      "start:three", "process:three.mp4", "success:three",
    ]);
  });

  it("marks the active and remaining items cancelled", async () => {
    const controller = new AbortController();
    const cancelled: string[][] = [];
    const processItem: QueueItemProcessor = async () => {
      controller.abort();
      throw new DOMException("Aborted", "AbortError");
    };

    await runSequentialVideoQueue(
      [makeItem("one"), makeItem("two")],
      processItem,
      {
        onStart: () => undefined,
        onProgress: () => undefined,
        onSuccess: () => undefined,
        onError: () => undefined,
        onCancelled: (items) => cancelled.push(items.map(({ id }) => id)),
      },
      controller.signal,
    );

    expect(cancelled).toEqual([["one", "two"]]);
  });
});
