// @vitest-environment node
import { describe, expect, it } from "vitest";
import { detectNativeCapabilities } from "../sidecar/capabilities";
import type { CommandRunner } from "../sidecar/process";

describe("sidecar native capability detection", () => {
  it("prefers VideoToolbox only after a successful encode smoke test", async () => {
    const runner: CommandRunner = async (command, args) => {
      if (args[0] === "-version") return { code: 0, stdout: `${command} version 7.1`, stderr: "", durationMs: 1 };
      const encoder = args[args.indexOf("-c:v") + 1];
      const code = encoder === "h264_videotoolbox" || encoder === "libx265" ? 0 : 1;
      return { code, stdout: "", stderr: code ? "runtime unavailable" : "", durationMs: 1 };
    };
    const result = await detectNativeCapabilities({
      ffmpegPath: "ffmpeg",
      ffprobePath: "ffprobe",
      runner,
      platform: "darwin",
      arch: "arm64",
    });

    expect(result.selected.h264).toBe("h264_videotoolbox");
    expect(result.selected.hevc).toBe("libx265");
    expect(result.encoders.find((encoder) => encoder.name === "hevc_videotoolbox")?.available).toBe(false);
  });

  it("falls back to software when NVENC is compiled but cannot encode", async () => {
    const runner: CommandRunner = async (command, args) => {
      if (command === "nvidia-smi") return { code: 0, stdout: "NVIDIA GeForce RTX 5080\n", stderr: "", durationMs: 1 };
      if (args[0] === "-version") return { code: 0, stdout: `${command} version 7.1`, stderr: "", durationMs: 1 };
      const encoder = args[args.indexOf("-c:v") + 1];
      const code = encoder === "libx264" || encoder === "libx265" ? 0 : 1;
      return { code, stdout: "", stderr: code ? "No capable devices found" : "", durationMs: 1 };
    };
    const result = await detectNativeCapabilities({
      ffmpegPath: "ffmpeg",
      ffprobePath: "ffprobe",
      runner,
      platform: "win32",
      arch: "x64",
    });

    expect(result.gpuName).toBe("NVIDIA GeForce RTX 5080");
    expect(result.selected).toEqual({ h264: "libx264", hevc: "libx265" });
  });
});
