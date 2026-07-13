import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RegionEditor } from "../src/components/RegionEditor";

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

    const stage = container.querySelector<HTMLElement>(".region-stage");
    expect(stage).not.toBeNull();
    expect(stage?.style.aspectRatio).toBe("1920 / 1080");
    expect(stage?.style.maxWidth).toBe("128vh");
  });
});
