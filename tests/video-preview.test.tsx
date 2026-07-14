import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VideoPreview } from "../src/components/VideoPreview";

afterEach(cleanup);

describe("VideoPreview", () => {
  it("combines the source video and watermark editor into the third workspace module", () => {
    render(
      <VideoPreview
        asset={{
          file: new File(["video"], "clip.mp4", { type: "video/mp4" }),
          url: "blob:clip",
          width: 1920,
          height: 1080,
          duration: 6,
          size: 5,
        }}
        region={{ x: 0.875, y: 0.79, width: 0.055, height: 0.09 }}
        onRegionChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("region", { name: "选择水印区域" })).toHaveAttribute("id", "watermark-selection");
    expect(screen.getByText("WATERMARK SELECTION / 03")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "选择水印区域" })).toBeInTheDocument();
    expect(screen.queryByText("SOURCE VIDEO / 03")).not.toBeInTheDocument();
  });

  it("explains automatic detection and disables manual selection in VEO mode", () => {
    const onRegionChange = vi.fn();
    render(
      <VideoPreview
        asset={{
          file: new File(["video"], "clip.mp4", { type: "video/mp4" }),
          url: "blob:clip",
          width: 1920,
          height: 1080,
          duration: 6,
          size: 5,
        }}
        region={{ x: 0.875, y: 0.79, width: 0.055, height: 0.09 }}
        automaticDetection
        onRegionChange={onRegionChange}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("VEO 将自动识别固定水印区域");
    expect(screen.getByRole("button", { name: "恢复默认" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "微调区域" })).toBeDisabled();
    expect(screen.queryByRole("application")).not.toBeInTheDocument();
    expect(screen.queryByText("起点 X")).not.toBeInTheDocument();
    expect(onRegionChange).not.toHaveBeenCalled();
  });
});
