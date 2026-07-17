import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProcessPanel } from "../src/components/ProcessPanel";

afterEach(cleanup);

describe("ProcessPanel", () => {
  it("marks VEO algorithm progress as an estimate while keeping a determinate progressbar", () => {
    render(
      <ProcessPanel
        state={{ phase: "processing", progress: 0.43, message: "VEO 算法处理中 · 预计 43% · 已耗时 01:12" }}
        total={1}
        completed={0}
        remaining={1}
        downloadingAll={false}
        mode="veo"
        sidecarUrl="http://127.0.0.1:3210"
        sidecarPairingCode="482731"
        sidecarState="ready"
        sidecarMessage="已连接"
        sidecarHealth={null}
        onProcess={vi.fn()}
        onCancel={vi.fn()}
        onClearQueue={vi.fn()}
        onDownloadAll={vi.fn()}
        onModeChange={vi.fn()}
        onSidecarUrlChange={vi.fn()}
        onConnectSidecar={vi.fn()}
      />,
    );

    expect(screen.getByText("预计", { selector: "small" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "批量处理进度" })).toHaveAttribute("aria-valuetext", expect.stringContaining("预计 43%"));
  });

  it("does not label external CLI frame progress as an estimate", () => {
    render(
      <ProcessPanel
        state={{ phase: "processing", progress: 0.43, message: "VEO 算法处理中 · CLI 帧进度 51% · 已耗时 00:05" }}
        total={1}
        completed={0}
        remaining={1}
        downloadingAll={false}
        mode="veo"
        sidecarUrl="http://127.0.0.1:3210"
        sidecarPairingCode=""
        sidecarState="ready"
        sidecarMessage="已连接"
        sidecarHealth={null}
        onProcess={vi.fn()}
        onCancel={vi.fn()}
        onClearQueue={vi.fn()}
        onDownloadAll={vi.fn()}
        onModeChange={vi.fn()}
        onSidecarUrlChange={vi.fn()}
        onConnectSidecar={vi.fn()}
      />,
    );

    expect(screen.queryByText("预计", { selector: "small" })).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "批量处理进度" })).toHaveAttribute("aria-valuetext", expect.stringContaining("CLI 帧进度"));
  });

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
        sidecarPairingCode=""
        sidecarState="idle"
        sidecarMessage="等待连接"
        sidecarHealth={null}
        onProcess={vi.fn()}
        onCancel={vi.fn()}
        onClearQueue={onClearQueue}
        onDownloadAll={onDownloadAll}
        onModeChange={vi.fn()}
        onSidecarUrlChange={vi.fn()}
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
        sidecarPairingCode=""
        sidecarState="idle"
        sidecarMessage="等待连接"
        sidecarHealth={null}
        onProcess={onProcess}
        onCancel={vi.fn()}
        onClearQueue={vi.fn()}
        onDownloadAll={vi.fn()}
        onModeChange={vi.fn()}
        onSidecarUrlChange={vi.fn()}
        onConnectSidecar={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "一键去水印" })).toBeDisabled();
    expect(onProcess).not.toHaveBeenCalled();
  });

  it("keeps VEO processing disabled until the selected CLI is verified", () => {
    const { rerender, container } = render(
      <ProcessPanel
        state={{ phase: "idle", progress: 0, message: "1 个视频等待处理" }}
        total={1}
        completed={0}
        remaining={1}
        downloadingAll={false}
        mode="veo"
        sidecarUrl="http://127.0.0.1:3210"
        sidecarPairingCode=""
        sidecarState="ready"
        sidecarMessage="已连接"
        sidecarHealth={null}
        onProcess={vi.fn()}
        onCancel={vi.fn()}
        onClearQueue={vi.fn()}
        onDownloadAll={vi.fn()}
        onModeChange={vi.fn()}
        onSidecarUrlChange={vi.fn()}
        onConnectSidecar={vi.fn()}
      />,
    );
    expect(within(container).getByRole("button", { name: "一键去水印" })).toBeDisabled();

    rerender(
      <ProcessPanel
        state={{ phase: "idle", progress: 0, message: "1 个视频等待处理" }}
        total={1}
        completed={0}
        remaining={1}
        downloadingAll={false}
        mode="veo"
        sidecarUrl="http://127.0.0.1:3210"
        sidecarPairingCode=""
        sidecarState="ready"
        sidecarMessage="已连接"
        sidecarHealth={null}
        veoCliStatus={{
          releaseVersion: "v0.6.4-demo",
          releaseUrl: "release",
          selection: { fileName: "fake", sizeBytes: 1, sha256: "sha", platform: "darwin", version: "v0.6.4-demo", valid: true },
        }}
        onProcess={vi.fn()}
        onCancel={vi.fn()}
        onClearQueue={vi.fn()}
        onDownloadAll={vi.fn()}
        onModeChange={vi.fn()}
        onSidecarUrlChange={vi.fn()}
        onConnectSidecar={vi.fn()}
      />,
    );
    expect(within(container).getByRole("button", { name: "一键去水印" })).toBeEnabled();
  });
});
