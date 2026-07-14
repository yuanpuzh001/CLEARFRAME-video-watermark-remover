import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import type { SidecarConfig } from "./config";
import { probeMedia, ratioValue, type MediaAnalysis } from "./media";
import type { CommandRunner } from "./process";
import { runCommand } from "./process";
import type { VeoCliSelection } from "./veo-binary";
import { verifyNativeOutput, type VerificationReport } from "./verify";

export interface VeoJobProgress {
  progress: number;
  message: string;
}

export interface VeoBitstreamIntegrity {
  supported: boolean;
  passed: boolean;
  reason?: string;
  processedVideoSha256?: string;
  finalVideoSha256?: string;
  sourceAudioSha256?: string;
  finalAudioSha256?: string;
  videoBitstreamEqual: boolean;
  audioBitstreamEqual: boolean;
}

export interface VeoJobResult {
  cliVersion: string;
  cliSha256: string;
  cliElapsedMs: number;
  finalizationElapsedMs: number;
  elapsedMs: number;
  verification: VerificationReport;
  mediaIntegrity: VeoBitstreamIntegrity;
  mediaIntegrityPassed: boolean;
  bitrateWithinTolerance: boolean;
}

type MediaProber = typeof probeMedia;
type MediaVerifier = typeof verifyNativeOutput;
type IntegrityVerifier = (options: {
  sourcePath: string;
  processedPath: string;
  finalPath: string;
  source: MediaAnalysis;
  processed: MediaAnalysis;
  final: MediaAnalysis;
  ffmpegPath: string;
  runner: CommandRunner;
}) => Promise<VeoBitstreamIntegrity>;

const MP4_COPY_SUBTITLES = new Set(["mov_text", "tx3g"]);
const VEO_REFERENCE_FPS = 1;
const VEO_PROGRESS_START = 0.05;
const VEO_PROGRESS_CEILING = 0.8;
const VEO_PROGRESS_INTERVAL_MS = 1_000;

function frameRate(analysis: MediaAnalysis): number {
  return ratioValue(analysis.video.avg_frame_rate) || ratioValue(analysis.video.r_frame_rate);
}

function sourceFrameCount(analysis: MediaAnalysis): number {
  const reported = Number(analysis.video.nb_read_frames ?? analysis.video.nb_frames);
  if (reported > 0) return reported;
  const rate = frameRate(analysis);
  return rate > 0 ? Math.max(1, Math.round(analysis.durationSeconds * rate)) : 1;
}

function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function estimateVeoCliProgress(source: MediaAnalysis, elapsedMs: number): VeoJobProgress {
  const estimatedDurationMs = sourceFrameCount(source) / VEO_REFERENCE_FPS * 1_000;
  const estimatedRatio = Math.min(1, Math.max(0, elapsedMs / estimatedDurationMs));
  const progress = Math.min(
    VEO_PROGRESS_CEILING,
    VEO_PROGRESS_START + estimatedRatio * (VEO_PROGRESS_CEILING - VEO_PROGRESS_START),
  );
  return {
    progress,
    message: `VEO 算法处理中 · 预计 ${Math.round(progress * 100)}% · 已耗时 ${formatElapsed(elapsedMs)}`,
  };
}

function streamSummaryMatches(source: MediaAnalysis, processed: MediaAnalysis): string[] {
  const errors: string[] = [];
  if (source.video.width !== processed.video.width || source.video.height !== processed.video.height) {
    errors.push(`外部 CLI 改变了分辨率：${source.video.width}×${source.video.height} → ${processed.video.width}×${processed.video.height}`);
  }
  const sourceRate = frameRate(source);
  const processedRate = frameRate(processed);
  if (sourceRate > 0 && Math.abs(sourceRate - processedRate) > 0.001) {
    errors.push(`外部 CLI 改变了帧率：${sourceRate.toFixed(6)} → ${processedRate.toFixed(6)}`);
  }
  const sourceFrames = Number(source.video.nb_read_frames ?? source.video.nb_frames);
  const processedFrames = Number(processed.video.nb_read_frames ?? processed.video.nb_frames);
  if (sourceFrames > 0 && processedFrames > 0 && sourceFrames !== processedFrames) {
    errors.push(`外部 CLI 改变了帧数：${sourceFrames} → ${processedFrames}`);
  }
  if (Math.abs(source.durationSeconds - processed.durationSeconds) > 0.05) {
    errors.push(`外部 CLI 改变了时长：${source.durationSeconds.toFixed(3)}s → ${processed.durationSeconds.toFixed(3)}s`);
  }
  return errors;
}

export function buildVeoRemuxArgs(options: {
  processedPath: string;
  sourcePath: string;
  outputPath: string;
  source: MediaAnalysis;
}): string[] {
  const args = [
    "-hide_banner", "-y",
    "-i", options.processedPath,
    "-i", options.sourcePath,
    "-map", "0:v:0",
    "-map", "1:a?",
  ];
  for (const subtitle of options.source.subtitles.filter((stream) => MP4_COPY_SUBTITLES.has(stream.codec_name ?? ""))) {
    args.push("-map", `1:${subtitle.index}?`);
  }
  args.push(
    "-map_metadata", "1",
    "-map_chapters", "1",
    "-c", "copy",
    "-movflags", "+faststart+use_metadata_tags",
    options.outputPath,
  );
  return args;
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function removeIfPresent(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
}

async function extractTrackHash(options: {
  inputPath: string;
  outputPath: string;
  kind: "video" | "audio";
  ffmpegPath: string;
  runner: CommandRunner;
}): Promise<string> {
  const args = options.kind === "video"
    ? [
        "-hide_banner", "-y", "-v", "error", "-i", options.inputPath,
        "-map", "0:v:0", "-c", "copy", "-bsf:v", "h264_mp4toannexb", "-f", "h264", options.outputPath,
      ]
    : [
        "-hide_banner", "-y", "-v", "error", "-i", options.inputPath,
        "-map", "0:a:0", "-c", "copy", "-f", "adts", options.outputPath,
      ];
  const result = await options.runner(options.ffmpegPath, args, { timeoutMs: 120_000 });
  if (result.code !== 0) {
    throw new Error(`提取${options.kind === "video" ? "视频" : "音频"} bitstream 失败：${result.stderr.trim() || `退出码 ${result.code}`}`);
  }
  return hashFile(options.outputPath);
}

export async function verifyVeoBitstreamIntegrity(options: {
  sourcePath: string;
  processedPath: string;
  finalPath: string;
  source: MediaAnalysis;
  processed: MediaAnalysis;
  final: MediaAnalysis;
  ffmpegPath: string;
  runner?: CommandRunner;
}): Promise<VeoBitstreamIntegrity> {
  const runner = options.runner ?? runCommand;
  const sourceAudio = options.source.audio;
  const finalAudio = options.final.audio;
  const h264Video = options.processed.video.codec_name === "h264" && options.final.video.codec_name === "h264";
  const singleAacAudio = sourceAudio.length === finalAudio.length
    && sourceAudio.length <= 1
    && sourceAudio.every((stream) => stream.codec_name === "aac")
    && finalAudio.every((stream) => stream.codec_name === "aac");
  if (!h264Video || !singleAacAudio) {
    return {
      supported: false,
      passed: false,
      reason: "精确轨道 SHA-256 验证当前仅支持单视频轨 H.264 与至多一条 AAC 音频的 MP4",
      videoBitstreamEqual: false,
      audioBitstreamEqual: sourceAudio.length === 0 && finalAudio.length === 0,
    };
  }
  const tempRoot = dirname(options.finalPath);
  const temporaryPaths = {
    processedVideo: join(tempRoot, `${randomUUID()}-processed.h264`),
    finalVideo: join(tempRoot, `${randomUUID()}-final.h264`),
    sourceAudio: join(tempRoot, `${randomUUID()}-source.aac`),
    finalAudio: join(tempRoot, `${randomUUID()}-final.aac`),
  };
  try {
    const processedVideoSha256 = await extractTrackHash({
      inputPath: options.processedPath,
      outputPath: temporaryPaths.processedVideo,
      kind: "video",
      ffmpegPath: options.ffmpegPath,
      runner,
    });
    const finalVideoSha256 = await extractTrackHash({
      inputPath: options.finalPath,
      outputPath: temporaryPaths.finalVideo,
      kind: "video",
      ffmpegPath: options.ffmpegPath,
      runner,
    });
    let sourceAudioSha256: string | undefined;
    let finalAudioSha256: string | undefined;
    if (sourceAudio.length === 1) {
      sourceAudioSha256 = await extractTrackHash({
        inputPath: options.sourcePath,
        outputPath: temporaryPaths.sourceAudio,
        kind: "audio",
        ffmpegPath: options.ffmpegPath,
        runner,
      });
      finalAudioSha256 = await extractTrackHash({
        inputPath: options.finalPath,
        outputPath: temporaryPaths.finalAudio,
        kind: "audio",
        ffmpegPath: options.ffmpegPath,
        runner,
      });
    }
    const videoBitstreamEqual = processedVideoSha256 === finalVideoSha256;
    const audioBitstreamEqual = sourceAudio.length === 0 || sourceAudioSha256 === finalAudioSha256;
    return {
      supported: true,
      passed: videoBitstreamEqual && audioBitstreamEqual,
      processedVideoSha256,
      finalVideoSha256,
      sourceAudioSha256,
      finalAudioSha256,
      videoBitstreamEqual,
      audioBitstreamEqual,
    };
  } finally {
    await removeIfPresent(temporaryPaths.processedVideo);
    await removeIfPresent(temporaryPaths.finalVideo);
    await removeIfPresent(temporaryPaths.sourceAudio);
    await removeIfPresent(temporaryPaths.finalAudio);
  }
}

export async function runVeoJob(options: {
  inputPath: string;
  intermediatePath: string;
  outputPath: string;
  cli: VeoCliSelection;
  config: SidecarConfig;
  signal?: AbortSignal;
  runner?: CommandRunner;
  prober?: MediaProber;
  verifier?: MediaVerifier;
  integrityVerifier?: IntegrityVerifier;
  onProgress?: (progress: VeoJobProgress) => void;
}): Promise<VeoJobResult> {
  if (!options.cli.valid || !options.cli.version) throw new Error("VEO CLI 尚未通过严格校验，禁止执行");
  const paths = [options.inputPath, options.intermediatePath, options.outputPath].map((path) => resolve(path));
  if (new Set(paths).size !== paths.length) throw new Error("原片、CLI 中间输出与最终输出必须使用三个不同路径");
  const runner = options.runner ?? runCommand;
  const prober = options.prober ?? probeMedia;
  const verifier = options.verifier ?? verifyNativeOutput;
  const integrityVerifier = options.integrityVerifier ?? verifyVeoBitstreamIntegrity;
  const notify = options.onProgress ?? (() => undefined);
  const startedAt = performance.now();
  notify({ progress: 0.02, message: "正在分析源媒体…" });
  const source = await prober(options.inputPath, options.config.ffprobePath, runner);

  notify({ progress: VEO_PROGRESS_START, message: "VEO 算法处理中 · 正在建立预计进度…" });
  const cliStartedAt = performance.now();
  const progressTimer = setInterval(() => {
    notify(estimateVeoCliProgress(source, performance.now() - cliStartedAt));
  }, VEO_PROGRESS_INTERVAL_MS);
  progressTimer.unref?.();
  let cliRun;
  try {
    cliRun = await runner(options.cli.path, ["-i", options.inputPath, "-o", options.intermediatePath], {
      signal: options.signal,
      timeoutMs: 1_800_000,
    });
  } finally {
    clearInterval(progressTimer);
  }
  const cliElapsedMs = performance.now() - cliStartedAt;
  if (cliRun.code !== 0) {
    throw new Error(`VEO CLI 处理失败：${cliRun.stderr.trim() || `退出码 ${cliRun.code}`}`);
  }
  const intermediateInfo = await lstat(options.intermediatePath);
  if (!intermediateInfo.isFile() || intermediateInfo.isSymbolicLink() || intermediateInfo.size <= 0) {
    throw new Error("VEO CLI 未生成有效的普通文件中间视频");
  }
  const processed = await prober(options.intermediatePath, options.config.ffprobePath, runner);
  const externalErrors = streamSummaryMatches(source, processed);
  if (externalErrors.length > 0) throw new Error(`VEO CLI 媒体属性验收失败：${externalErrors.join("；")}`);

  notify({ progress: 0.84, message: "正在无损复制视频轨、原片音频与元数据…" });
  const finalizationStartedAt = performance.now();
  const remux = await runner(options.config.ffmpegPath, buildVeoRemuxArgs({
    processedPath: options.intermediatePath,
    sourcePath: options.inputPath,
    outputPath: options.outputPath,
    source,
  }), { signal: options.signal, timeoutMs: 300_000 });
  const finalizationElapsedMs = performance.now() - finalizationStartedAt;
  if (remux.code !== 0) throw new Error(`媒体无损封装失败：${remux.stderr.trim() || `退出码 ${remux.code}`}`);

  notify({ progress: 0.92, message: "正在分别验证媒体完整性与码率容差…" });
  const verification = await verifier({
    inputPath: options.inputPath,
    outputPath: options.outputPath,
    source,
    ffmpegPath: options.config.ffmpegPath,
    ffprobePath: options.config.ffprobePath,
    bitrateTolerance: options.config.bitrateTolerance,
    runner,
  });
  if (!verification.valid) throw new Error(`最终媒体验收失败：${verification.errors.join("；")}`);
  const mediaIntegrity = await integrityVerifier({
    sourcePath: options.inputPath,
    processedPath: options.intermediatePath,
    finalPath: options.outputPath,
    source,
    processed,
    final: verification.output,
    ffmpegPath: options.config.ffmpegPath,
    runner,
  });
  if (!mediaIntegrity.passed) {
    throw new Error(`媒体完整性验收未通过：${mediaIntegrity.reason ?? "视频轨或音频轨 SHA-256 不一致"}`);
  }
  notify({ progress: 1, message: "VEO 实验处理完成" });
  return {
    cliVersion: options.cli.version,
    cliSha256: options.cli.sha256,
    cliElapsedMs,
    finalizationElapsedMs,
    elapsedMs: performance.now() - startedAt,
    verification,
    mediaIntegrity,
    mediaIntegrityPassed: mediaIntegrity.passed,
    bitrateWithinTolerance: verification.bitrateWithinTolerance,
  };
}
