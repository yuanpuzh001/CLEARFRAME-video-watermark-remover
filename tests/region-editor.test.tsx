import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RegionEditor } from "../src/components/RegionEditor";

afterEach(cleanup);

describe("RegionEditor", () => {
  it("keeps the overlay stage at the video's aspect ratio when height-limited", () => {
    const { container } = render(
      <RegionEditor
        asset={{
          file: new File(["video"], "clip.mp4", { type: "video/mp4" }),
          url: "blob:clip",
          width: 1920,
          height: 1080,
          duration: 6,
          size: 5,
        }}
        region={{ x: 0.875, y: 0.79, width: 0.055, height: 0.09 }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("WATERMARK SELECTION / 03")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "选择水印区域" })).toBeInTheDocument();
    const stage = container.querySelector<HTMLElement>(".region-stage");
    expect(stage).not.toBeNull();
    expect(stage?.style.aspectRatio).toBe("1920 / 1080");
    expect(stage?.style.maxWidth).toBe("128vh");
  });

  it("removes the interactive overlay when automatic detection is active", () => {
    const { container } = render(
      <RegionEditor
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
        onChange={vi.fn()}
      />,
    );

    expect(container.querySelector(".region-stage")).toHaveClass("is-automatic");
    expect(container.querySelector(".region-box")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("当前模式不使用手动选区");
  });
});
