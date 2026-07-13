import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BatchQueue } from "../src/components/BatchQueue";
import type { VideoQueueItem } from "../src/types/video";

function queueItem(id: string, name: string): VideoQueueItem {
  return {
    id,
    asset: {
      file: new File([name], name, { type: "video/mp4" }),
      url: `blob:${id}`,
      width: 1920,
      height: 1080,
      duration: 6,
      size: 1024,
    },
    region: { x: 0.875, y: 0.79, width: 0.055, height: 0.09 },
  };
}

describe("BatchQueue", () => {
  it("switches and removes individual queue items", () => {
    const onSelect = vi.fn();
    const onRemove = vi.fn();
    render(
      <BatchQueue
        items={[queueItem("one", "one.mp4"), queueItem("two", "two.mp4")]}
        states={{}}
        activeId="one"
        onAdd={vi.fn()}
        onRemove={onRemove}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "编辑 two.mp4" }));
    fireEvent.click(screen.getByRole("button", { name: "移除 one.mp4" }));
    expect(onSelect).toHaveBeenCalledWith("two");
    expect(onRemove).toHaveBeenCalledWith("one");
  });
});
