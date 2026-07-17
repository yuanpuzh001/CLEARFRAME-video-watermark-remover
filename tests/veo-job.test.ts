// @vitest-environment node
import { mkdtemp, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { SidecarConfig } from "../sidecar/config";
import { analyzeProbe, type MediaAnalysis, type MediaProbe } from "../sidecar/media";
import type { CommandRunner } from "../sidecar/process";
import type { VerificationReport } from "../sidecar/verify";
import { buildVeoCliArgs, buildVeoRemuxArgs, estimateVeoCliProgress, parseVeoCliProgress, runVeoJob } from "../sidecar/veo-job";

const files: string[] = [];
const directories: string[] = [];

afterEach(async () => {
  while (files.length) await unlink(files.pop()!);
  while (directories.length) await rmdir(directories.pop()!);
});

const probe: MediaProbe = {
  streams: [
    { index: 0, codec_type: "video", codec_name: "h264", width: 1920, height: 1080, pix_fmt: "yuv420p", avg_frame_rate: "24/1", r_frame_rate: "24/1", duration: "6", bit_rate: "8000000", nb_frames: "144" },
    { index: 1, codec_type: "audio", codec_name: "aac", duration: "6" },
    { index: 2, codec_type: "subtitle", codec_name: "mov_text", duration: "6" },
  ],
  format: { duration: "6", bit_rate: "8128000" },
};
const analysis = analyzeProbe(probe);

const config: SidecarConfig = {
  host: "127.0.0.1",
  port: 3210,
  token: "token",
  ffmpegPath: "ffmpeg",
  ffprobePath: "ffprobe",
  bitrateTolerance: 0.1,
  allowedOrigins: ["http://127.0.0.1:5173"],
  maxUploadBytes: 1024,
};

describe("VEO media-quality chain", () => {
  it("turns the known frame count into a capped, clearly labelled progress estimate", () => {
    const halfway = estimateVeoCliProgress(analysis, 72_000);
    const overdue = estimateVeoCliProgress(analysis, 300_000);

    expect(halfway.progress).toBeCloseTo(0.425, 3);
    expect(halfway.message).toContain("预计 43%");
    expect(halfway.message).toContain("已耗时 01:12");
    expect(overdue.progress).toBe(0.8);
    expect(overdue.message).toContain("预计 80%");
  });

  it("parses real frame progress when the external CLI exposes it", () => {
    expect(parseVeoCliProgress("[Veo 96x96 103/240 frames x1.00]")).toBeCloseTo(103 / 240, 4);
    expect(parseVeoCliProgress("[################] 65% (94/144)")).toBeCloseTo(94 / 144, 4);
    expect(parseVeoCliProgress("Video processing progress: 67.5%")).toBeCloseTo(0.675, 4);
    expect(parseVeoCliProgress("ordinary diagnostic output")).toBeUndefined();
  });

  it("adds only the reviewed force flag for fixed-watermark occlusion handling", () => {
    expect(buildVeoCliArgs({ inputPath: "in.mp4", outputPath: "out.mp4", forceAllFrames: true }))
      .toEqual(["--veo", "--no-banner", "--force", "-i", "in.mp4", "-o", "out.mp4"]);
  });

  it("builds a stream-copy-only finalization command from processed video and original media", () => {
    const args = buildVeoRemuxArgs({
      processedPath: "/tmp/processed.mp4",
      sourcePath: "/tmp/source.mp4",
      outputPath: "/tmp/final.mp4",
      source: analysis,
    });

    expect(args).toContain("copy");
    expect(args).toContain("0:v:0");
    expect(args).toContain("1:a?");
    expect(args).toContain("1:2?");
    expect(args).not.toContain("libx264");
    expect(args).not.toContain("h264_videotoolbox");
  });

  it("uses only fixed CLI arguments and reports integrity separately from bitrate tolerance", async () => {
    const directory = await mkdtemp(join(tmpdir(), "clearframe-veo-job-test-"));
    directories.push(directory);
    const inputPath = join(directory, "source.mp4");
    const intermediatePath = join(directory, "processed.mp4");
    const outputPath = join(directory, "final.mp4");
    await writeFile(inputPath, "source");
    files.push(inputPath, intermediatePath, outputPath);
    const calls: Array<{ command: string; args: string[] }> = [];
    const runner: CommandRunner = async (command, args) => {
      calls.push({ command, args });
      if (command === "/trusted/fake-veo") await writeFile(intermediatePath, "processed");
      if (command === "ffmpeg") await writeFile(outputPath, "final");
      return { code: 0, stdout: "", stderr: "", durationMs: 1 };
    };
    const prober = async (): Promise<MediaAnalysis> => analysis;
    const verifier = async (): Promise<VerificationReport> => ({
      valid: true,
      errors: [],
      warnings: ["视频码率偏差 -27.86%"],
      sourceVideoBitrate: 8_000_000,
      actualVideoBitrate: 5_771_200,
      bitrateDelta: -0.2786,
      bitrateWithinTolerance: false,
      sourceFrameCount: 144,
      outputFrameCount: 144,
      maxPtsDeltaSeconds: 0,
      maxAvStartDeltaSeconds: 0,
      maxAudioDurationDeltaSeconds: 0,
      audioSourceHash: "audio",
      audioOutputHash: "audio",
      audioBitstreamEqual: true,
      decodePassed: true,
      dtsMonotonic: true,
      output: analysis,
    });
    const result = await runVeoJob({
      inputPath,
      intermediatePath,
      outputPath,
      cli: {
        path: "/trusted/fake-veo",
        fileName: "fake-veo",
        sizeBytes: 1,
        sha256: "trusted-test-hash",
        platform: "darwin",
        version: "v0.6.4-demo-test",
        valid: true,
      },
      config,
      runner,
      prober,
      verifier,
      integrityVerifier: async () => ({
        supported: true,
        passed: true,
        videoBitstreamEqual: true,
        audioBitstreamEqual: true,
      }),
    });

    expect(calls[0]).toEqual({
      command: "/trusted/fake-veo",
      args: ["--veo", "--no-banner", "-i", inputPath, "-o", intermediatePath],
    });
    expect(result.mediaIntegrityPassed).toBe(true);
    expect(result.bitrateWithinTolerance).toBe(false);
  });

  it("refuses to reuse the source path for any output", async () => {
    await expect(runVeoJob({
      inputPath: "/tmp/source.mp4",
      intermediatePath: "/tmp/source.mp4",
      outputPath: "/tmp/final.mp4",
      cli: { path: "/fake", fileName: "fake", sizeBytes: 1, sha256: "hash", platform: "darwin", version: "test", valid: true },
      config,
    })).rejects.toThrow("三个不同路径");
  });
});
