// @vitest-environment node
import { describe, expect, it } from "vitest";
import { compareAudioSync, compareTimelines, correctedTargetBitrate, dtsAreMonotonic } from "../sidecar/verify";
import { analyzeProbe, type MediaProbe } from "../sidecar/media";

describe("sidecar quality verification helpers", () => {
  it("compares relative presentation timestamps for CFR and VFR inputs", () => {
    const comparison = compareTimelines([1, 1.04, 1.1], [0, 0.04, 0.1]);
    expect(comparison.sameCount).toBe(true);
    expect(comparison.maxDelta).toBeLessThan(1e-12);
    expect(compareTimelines([0, 0.04], [0, 0.04, 0.08]).sameCount).toBe(false);
  });

  it("rejects non-monotonic DTS per stream", () => {
    expect(dtsAreMonotonic([
      { stream_index: 0, dts_time: "0" },
      { stream_index: 1, dts_time: "0" },
      { stream_index: 0, dts_time: "0.04" },
    ])).toBe(true);
    expect(dtsAreMonotonic([
      { stream_index: 0, dts_time: "0.04" },
      { stream_index: 0, dts_time: "0.02" },
    ])).toBe(false);
  });

  it("corrects the target bitrate by source-to-actual ratio once", () => {
    expect(correctedTargetBitrate(8_000_000, 8_000_000, 10_000_000)).toBe(6_400_000);
    expect(correctedTargetBitrate(8_000_000, 8_000_000, 1_000_000)).toBe(16_000_000);
  });

  it("checks audio timing relative to the video stream", () => {
    const makeProbe = (videoStart: string, audioStart: string, audioDuration: string): MediaProbe => ({
      streams: [
        { index: 0, codec_type: "video", codec_name: "h264", width: 1920, height: 1080, start_time: videoStart, duration: "6", avg_frame_rate: "24/1", r_frame_rate: "24/1", bit_rate: "8000000" },
        { index: 1, codec_type: "audio", codec_name: "aac", start_time: audioStart, duration: audioDuration },
      ],
      format: { duration: "6", bit_rate: "8000000" },
    });
    const source = analyzeProbe(makeProbe("1.000", "1.020", "5.980"));
    const aligned = analyzeProbe(makeProbe("0.000", "0.020", "5.980"));
    const shifted = analyzeProbe(makeProbe("0.000", "0.120", "5.700"));

    const alignedResult = compareAudioSync(source, aligned);
    expect(alignedResult.sameStreamCount).toBe(true);
    expect(alignedResult.maxStartDelta).toBeCloseTo(0);
    expect(alignedResult.maxDurationDelta).toBe(0);
    expect(compareAudioSync(source, shifted).maxStartDelta).toBeCloseTo(0.1);
    expect(compareAudioSync(source, shifted).maxDurationDelta).toBeCloseTo(0.28);
  });
});
