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
        mode="browser"
        sidecarUrl="http://127.0.0.1:3210"
        sidecarToken=""
        sidecarState="idle"
        sidecarMessage="等待连接"
        sidecarHealth={null}
        onProcess={vi.fn()}
        onCancel={vi.fn()}
        onClearQueue={onClearQueue}
        onDownloadAll={onDownloadAll}
        onModeChange={vi.fn()}
        onSidecarUrlChange={vi.fn()}
        onSidecarTokenChange={vi.fn()}
        onConnectSidecar={vi.fn()}
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

  it("does not start native processing before the sidecar is paired", () => {
    const onProcess = vi.fn();
    render(
      <ProcessPanel
        state={{ phase: "idle", progress: 0, message: "1 个视频等待处理" }}
        total={1}
        completed={0}
        remaining={1}
        downloadingAll={false}
        mode="native"
        sidecarUrl="http://127.0.0.1:3210"
        sidecarToken=""
        sidecarState="idle"
        sidecarMessage="等待连接"
        sidecarHealth={null}
        onProcess={onProcess}
        onCancel={vi.fn()}
        onClearQueue={vi.fn()}
        onDownloadAll={vi.fn()}
        onModeChange={vi.fn()}
        onSidecarUrlChange={vi.fn()}
        onSidecarTokenChange={vi.fn()}
        onConnectSidecar={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "一键去水印" })).toBeDisabled();
    expect(onProcess).not.toHaveBeenCalled();
  });
});
