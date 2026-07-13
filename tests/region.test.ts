import { describe, expect, it } from "vitest";
import { clampRegion, regionToPixels } from "../src/lib/video/region";

describe("watermark region", () => {
  it("keeps the selection inside the video", () => {
    expect(clampRegion({ x: 0.98, y: -0.2, width: 0.2, height: 0.3 })).toEqual({
      x: 0.8,
      y: 0,
      width: 0.2,
      height: 0.3,
    });
  });

  it("converts normalized values to even H.264 pixel coordinates", () => {
    const pixels = regionToPixels({ x: 0.875, y: 0.79, width: 0.055, height: 0.09 }, 1920, 1080);
    expect(pixels).toEqual({ x: 1680, y: 854, width: 106, height: 98 });
    expect(Object.values(pixels).every((value) => value % 2 === 0)).toBe(true);
  });
});
