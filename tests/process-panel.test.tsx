import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProcessPanel } from "../src/components/ProcessPanel";

describe("ProcessPanel", () => {
  it("offers one archive download after a batch completes", () => {
    const onDownloadAll = vi.fn();
    const onClearQueue = vi.fn();
    render(
      <ProcessPanel
        state={{ phase: "success", progress: 1, message: "全部 2 个视频处理完成" }}
        total={2}
        completed={2}
        remaining={0}
        downloadingAll={false}
        onProcess={vi.fn()}
        onCancel={vi.fn()}
        onClearQueue={onClearQueue}
        onDownloadAll={onDownloadAll}
      />,
    );

    expect(screen.getByRole("region", { name: "批量去水印" })).toHaveAttribute("id", "process");
    expect(screen.getByText("PROCESS / 02")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "批量处理进度" })).toHaveAttribute("aria-valuenow", "100");
    fireEvent.click(screen.getByRole("button", { name: "清空队列" }));
    expect(onClearQueue).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "下载全部视频" }));
    expect(onDownloadAll).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "全部已完成" })).not.toBeInTheDocument();
  });
});
