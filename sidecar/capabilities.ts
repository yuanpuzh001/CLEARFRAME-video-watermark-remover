import { arch as currentArch, platform as currentPlatform } from "node:process";
import type { CommandRunner } from "./process";
import { runCommand } from "./process";

export type CodecFamily = "h264" | "hevc";

export interface EncoderProbe {
  name: string;
  family: CodecFamily;
  kind: "hardware" | "software";
  available: boolean;
  reason?: string;
}

export interface NativeCapabilities {
  platform: NodeJS.Platform;
  arch: string;
  ffmpegVersion: string;
  ffprobeVersion: string;
  encoders: EncoderProbe[];
  selected: Partial<Record<CodecFamily, string>>;
  gpuName?: string;
}

interface DetectOptions {
  ffmpegPath: string;
  ffprobePath: string;
  runner?: CommandRunner;
  platform?: NodeJS.Platform;
  arch?: string;
}

function firstLine(value: string): string {
  return value.trim().split(/\r?\n/, 1)[0] ?? "";
}

async function requireBinary(path: string, runner: CommandRunner): Promise<string> {
  const result = await runner(path, ["-version"], { timeoutMs: 10_000 });
  if (result.code !== 0) throw new Error(`${path} 不可用：${firstLine(result.stderr) || `退出码 ${result.code}`}`);
  return firstLine(result.stdout);
}

function encoderCandidates(platform: NodeJS.Platform, architecture: string): EncoderProbe[] {
  const hardware: EncoderProbe[] = platform === "darwin" && architecture === "arm64"
    ? [
        { name: "h264_videotoolbox", family: "h264", kind: "hardware", available: false },
        { name: "hevc_videotoolbox", family: "hevc", kind: "hardware", available: false },
      ]
    : platform === "win32"
      ? [
          { name: "h264_nvenc", family: "h264", kind: "hardware", available: false },
          { name: "hevc_nvenc", family: "hevc", kind: "hardware", available: false },
        ]
      : [];
  return [
    ...hardware,
    { name: "libx264", family: "h264", kind: "software", available: false },
    { name: "libx265", family: "hevc", kind: "software", available: false },
  ];
}

async function smokeTestEncoder(
  ffmpegPath: string,
  encoder: EncoderProbe,
  runner: CommandRunner,
): Promise<EncoderProbe> {
  const result = await runner(ffmpegPath, [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=black:s=128x72:r=1",
    "-frames:v", "1", "-an", "-c:v", encoder.name,
    "-f", "null", "-",
  ], { timeoutMs: 20_000 });
  return result.code === 0
    ? { ...encoder, available: true }
    : { ...encoder, available: false, reason: firstLine(result.stderr) || `退出码 ${result.code}` };
}

async function detectWindowsGpu(platform: NodeJS.Platform, runner: CommandRunner): Promise<string | undefined> {
  if (platform !== "win32") return undefined;
  try {
    const result = await runner("nvidia-smi", ["--query-gpu=name", "--format=csv,noheader"], { timeoutMs: 5_000 });
    return result.code === 0 ? firstLine(result.stdout) || undefined : undefined;
  } catch {
    return undefined;
  }
}

export async function detectNativeCapabilities(options: DetectOptions): Promise<NativeCapabilities> {
  const runner = options.runner ?? runCommand;
  const platform = options.platform ?? currentPlatform;
  const architecture = options.arch ?? currentArch;
  const [ffmpegVersion, ffprobeVersion, gpuName] = await Promise.all([
    requireBinary(options.ffmpegPath, runner),
    requireBinary(options.ffprobePath, runner),
    detectWindowsGpu(platform, runner),
  ]);
  const encoders: EncoderProbe[] = [];
  for (const candidate of encoderCandidates(platform, architecture)) {
    try {
      encoders.push(await smokeTestEncoder(options.ffmpegPath, candidate, runner));
    } catch (error) {
      encoders.push({ ...candidate, available: false, reason: error instanceof Error ? error.message : "探测失败" });
    }
  }
  const selected: NativeCapabilities["selected"] = {};
  for (const family of ["h264", "hevc"] as const) {
    const preferred = encoders.find((encoder) => encoder.family === family && encoder.available && encoder.kind === "hardware")
      ?? encoders.find((encoder) => encoder.family === family && encoder.available && encoder.kind === "software");
    if (preferred) selected[family] = preferred.name;
  }
  return { platform, arch: architecture, ffmpegVersion, ffprobeVersion, encoders, selected, gpuName };
}
