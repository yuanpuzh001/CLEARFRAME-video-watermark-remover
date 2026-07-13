import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResultPanel } from "../src/components/ResultPanel";

describe("ResultPanel download URL", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("recreates the Blob URL after the Strict Mode effect cleanup", async () => {
    const createObjectURL = vi.fn()
      .mockReturnValueOnce("blob:first-result")
      .mockReturnValueOnce("blob:active-result");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });

    const { unmount } = render(
      <StrictMode>
        <ResultPanel
          asset={{
            file: new File(["video"], "clip.mp4", { type: "video/mp4" }),
            url: "blob:source",
            width: 1920,
            height: 1080,
            duration: 6,
            size: 5,
          }}
          result={new Blob(["result"], { type: "video/mp4" })}
          onReprocess={vi.fn()}
        />
      </StrictMode>,
    );

    expect(screen.getByText("OUTPUT VIDEO / 04")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "修复结果" })).toBeInTheDocument();
    const download = await screen.findByRole("link", { name: "下载视频" });
    await waitFor(() => expect(download).toHaveAttribute("href", "blob:active-result"));
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:first-result");
    expect(revokeObjectURL).not.toHaveBeenCalledWith("blob:active-result");

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:active-result");
  });

  it("keeps the batch progress area in view when a result becomes available", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:batch-result") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    render(
      <ResultPanel
        asset={{
          file: new File(["video"], "batch.mp4", { type: "video/mp4" }),
          url: "blob:source",
          width: 1920,
          height: 1080,
          duration: 6,
          size: 5,
        }}
        result={new Blob(["result"], { type: "video/mp4" })}
        autoScroll={false}
        onReprocess={vi.fn()}
      />,
    );

    await screen.findByRole("link", { name: "下载视频" });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
