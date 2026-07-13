// @vitest-environment node
import { describe, expect, it } from "vitest";
import { analyzeProbe, type MediaProbe } from "../sidecar/media";
import { buildNativeDelogoPlan } from "../sidecar/encode-plan";
import type { NativeCapabilities } from "../sidecar/capabilities";

const probe: MediaProbe = {
  streams: [
    {
      index: 0,
      codec_type: "video",
      codec_name: "h264",
      width: 1920,
      height: 1080,
      pix_fmt: "yuv420p",
      sample_aspect_ratio: "1:1",
      avg_frame_rate: "24/1",
      r_frame_rate: "24/1",
      duration: "6",
      bit_rate: "8000000",
      nb_read_frames: "144",
      color_primaries: "bt709",
      color_transfer: "bt709",
      color_space: "bt709",
      color_range: "tv",
    },
    { index: 1, codec_type: "audio", codec_name: "aac", bit_rate: "192000" },
    { index: 2, codec_type: "subtitle", codec_name: "mov_text" },
  ],
  format: { duration: "6", bit_rate: "8192000", size: "6144000" },
  chapters: [{ id: 0 }],
};

const capabilities: NativeCapabilities = {
  platform: "darwin",
  arch: "arm64",
  ffmpegVersion: "ffmpeg version 7.1",
  ffprobeVersion: "ffprobe version 7.1",
  encoders: [
    { name: "h264_videotoolbox", family: "h264", kind: "hardware", available: true },
    { name: "libx264", family: "h264", kind: "software", available: true },
  ],
  selected: { h264: "h264_videotoolbox" },
};

describe("sidecar media planning", () => {
  it("keeps source media properties without forcing a frame rate", () => {
    const analysis = analyzeProbe(probe);
    const plan = buildNativeDelogoPlan({
      inputPath: "input.mp4",
      outputPath: "output.mp4",
      region: { x: 0.875, y: 0.79, width: 0.055, height: 0.09 },
      analysis,
      capabilities,
    });

    expect(plan.encoder).toBe("h264_videotoolbox");
    expect(plan.hardware).toBe(true);
    expect(plan.targetBitrate).toBe(8_000_000);
    expect(plan.args.find((argument) => argument.startsWith("delogo="))).toContain("delogo=x=1680:y=854:w=106:h=98");
    expect(plan.args).toContain("yuv420p");
    expect(plan.args).toContain("passthrough");
    expect(plan.args).not.toContain("-r");
    expect(plan.args).toContain("0:a?");
    expect(plan.args).toContain("0:2?");
    expect(plan.args).toContain("bt709");
  });

  it("detects VFR from nominal and average frame-rate divergence", () => {
    const analysis = analyzeProbe({
      ...probe,
      streams: [{ ...probe.streams[0], avg_frame_rate: "24000/1001", r_frame_rate: "30/1" }],
    });
    expect(analysis.isVariableFrameRate).toBe(true);
  });
});
