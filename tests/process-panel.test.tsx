import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProcessPanel } from "../src/components/ProcessPanel";

describe("ProcessPanel", () => {
  it("offers one archive download after a batch completes", () => {
    const onDownloadAll = vi.fn();
    render(
      <ProcessPanel
        state={{ phase: "success", progress: 1, message: "全部 2 个视频处理完成" }}
        total={2}
        completed={2}
        remaining={0}
        downloadingAll={false}
        onProcess={vi.fn()}
        onCancel={vi.fn()}
        onDownloadAll={onDownloadAll}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "全部下载" }));
    expect(onDownloadAll).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "全部已完成" })).not.toBeInTheDocument();
  });
});
