import { describe, expect, it } from "vitest";
import {
  cleanOutputName,
  formatBytes,
  formatDuration,
  MAX_FILE_BYTES,
  validateVideoFile,
  validateVideoFiles,
  VideoValidationError,
} from "../src/lib/video/validation";

describe("video validation", () => {
  it("accepts an MP4 within the size limit", () => {
    expect(() => validateVideoFile(new File(["data"], "clip.mp4", { type: "video/mp4" }))).not.toThrow();
  });

  it("rejects non-MP4 input", () => {
    expect(() => validateVideoFile(new File(["data"], "clip.mov", { type: "video/quicktime" }))).toThrow(VideoValidationError);
  });

  it("separates accepted and rejected files in a batch", () => {
    const valid = new File(["data"], "first.mp4", { type: "video/mp4" });
    const wrongType = new File(["data"], "second.mov", { type: "video/quicktime" });
    const tooLarge = new File(["data"], "third.mp4", { type: "video/mp4" });
    Object.defineProperty(tooLarge, "size", { value: MAX_FILE_BYTES + 1 });

    const batch = validateVideoFiles([valid, wrongType, tooLarge]);

    expect(batch.accepted).toEqual([valid]);
    expect(batch.rejected.map(({ file, message }) => ({ name: file.name, message }))).toEqual([
      { name: "second.mov", message: "仅支持 MP4 格式，请重新选择文件。" },
      { name: "third.mp4", message: "文件超过 200MB，请选择更小的视频。" },
    ]);
  });

  it("formats media metadata", () => {
    expect(formatBytes(10 * 1024 * 1024)).toBe("10.0 MB");
    expect(formatDuration(66.9)).toBe("01:06");
    expect(cleanOutputName("cyberpunk_room.MP4")).toBe("cyberpunk_room-clean.mp4");
  });
});
