import { describe, expect, it } from "vitest";
import { cleanOutputName, formatBytes, formatDuration, validateVideoFile, VideoValidationError } from "../src/lib/video/validation";

describe("video validation", () => {
  it("accepts an MP4 within the size limit", () => {
    expect(() => validateVideoFile(new File(["data"], "clip.mp4", { type: "video/mp4" }))).not.toThrow();
  });

  it("rejects non-MP4 input", () => {
    expect(() => validateVideoFile(new File(["data"], "clip.mov", { type: "video/quicktime" }))).toThrow(VideoValidationError);
  });

  it("formats media metadata", () => {
    expect(formatBytes(10 * 1024 * 1024)).toBe("10.0 MB");
    expect(formatDuration(66.9)).toBe("01:06");
    expect(cleanOutputName("cyberpunk_room.MP4")).toBe("cyberpunk_room-clean.mp4");
  });
});
