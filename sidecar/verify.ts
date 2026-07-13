import { createHash } from "node:crypto";
import type { CommandRunner } from "./process";
import { runCommand } from "./process";
import { codecFamilyOf, probeMedia, type MediaAnalysis } from "./media";

interface FrameProbe { frames?: Array<{ best_effort_timestamp_time?: string }> }
interface PacketProbe { packets?: Array<{ stream_index?: number; dts_time?: string; data_hash?: string }> }

export interface VerificationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sourceVideoBitrate: number;
  actualVideoBitrate: number;
  bitrateDelta: number;
  bitrateWithinTolerance: boolean;
  sourceFrameCount: number;
  outputFrameCount: number;
  maxPtsDeltaSeconds: number;
  maxAvStartDeltaSeconds: number;
  maxAudioDurationDeltaSeconds: number;
  audioSourceHash?: string;
  audioOutputHash?: string;
  audioBitstreamEqual: boolean;
  decodePassed: boolean;
  dtsMonotonic: boolean;
  output: MediaAnalysis;
}

export interface AudioSyncComparison {
  sameStreamCount: boolean;
  maxStartDelta: number;
  maxDurationDelta: number;
}

function parseJson<T>(stdout: string, label: string): T {
  try {
    return JSON.parse(stdout) as T;
  } catch {
    throw new Error(`${label} 返回了无法解析的 JSON`);
  }
}

async function readFramePts(path: string, ffprobePath: string, runner: CommandRunner): Promise<number[]> {
  const result = await runner(ffprobePath, [
    "-v", "error", "-select_streams", "v:0", "-show_frames",
    "-show_entries", "frame=best_effort_timestamp_time", "-of", "json", path,
  ], { timeoutMs: 60_000 });
  if (result.code !== 0) throw new Error(`读取视频 PTS 失败：${result.stderr.trim()}`);
  return (parseJson<FrameProbe>(result.stdout, "PTS 探测").frames ?? [])
    .map((frame) => Number(frame.best_effort_timestamp_time))
    .filter(Number.isFinite);
}

async function readPackets(path: string, ffprobePath: string, runner: CommandRunner): Promise<NonNullable<PacketProbe["packets"]>> {
  const result = await runner(ffprobePath, [
    "-v", "error", "-show_packets", "-show_entries", "packet=stream_index,dts_time",
    "-of", "json", path,
  ], { timeoutMs: 60_000 });
  if (result.code !== 0) throw new Error(`读取 DTS 失败：${result.stderr.trim()}`);
  return parseJson<PacketProbe>(result.stdout, "DTS 探测").packets ?? [];
}

async function audioPacketHash(path: string, ffprobePath: string, runner: CommandRunner): Promise<string | undefined> {
  const result = await runner(ffprobePath, [
    "-v", "error", "-select_streams", "a", "-show_packets",
    "-show_entries", "packet=stream_index,data_hash", "-show_data_hash", "sha256",
    "-of", "json", path,
  ], { timeoutMs: 60_000 });
  if (result.code !== 0) throw new Error(`读取音频 bitstream 失败：${result.stderr.trim()}`);
  const packets = parseJson<PacketProbe>(result.stdout, "音频探测").packets ?? [];
  if (packets.length === 0) return undefined;
  const streamHashes = new Map<number, ReturnType<typeof createHash>>();
  for (const packet of packets) {
    const streamIndex = packet.stream_index ?? -1;
    const hash = streamHashes.get(streamIndex) ?? createHash("sha256");
    hash.update(`${packet.data_hash ?? ""}\n`);
    streamHashes.set(streamIndex, hash);
  }
  const aggregate = createHash("sha256");
  for (const [, hash] of [...streamHashes.entries()].sort(([left], [right]) => left - right)) {
    aggregate.update(`${hash.digest("hex")}\n`);
  }
  return aggregate.digest("hex");
}

export function dtsAreMonotonic(packets: NonNullable<PacketProbe["packets"]>): boolean {
  const previous = new Map<number, number>();
  for (const packet of packets) {
    const streamIndex = packet.stream_index;
    const dts = Number(packet.dts_time);
    if (streamIndex === undefined || !Number.isFinite(dts)) continue;
    const last = previous.get(streamIndex);
    if (last !== undefined && dts < last - 1e-9) return false;
    previous.set(streamIndex, dts);
  }
  return true;
}

export function compareTimelines(source: number[], output: number[]): { maxDelta: number; sameCount: boolean } {
  if (source.length === 0 || output.length === 0) {
    return { maxDelta: Number.POSITIVE_INFINITY, sameCount: source.length === output.length };
  }
  const sourceStart = source[0];
  const outputStart = output[0];
  const count = Math.min(source.length, output.length);
  let maxDelta = 0;
  for (let index = 0; index < count; index += 1) {
    maxDelta = Math.max(maxDelta, Math.abs((source[index] - sourceStart) - (output[index] - outputStart)));
  }
  return { maxDelta, sameCount: source.length === output.length };
}

function frameCount(analysis: MediaAnalysis, timeline: number[]): number {
  const counted = Number(analysis.video.nb_read_frames ?? analysis.video.nb_frames);
  return Number.isFinite(counted) && counted > 0 ? counted : timeline.length;
}

function sameTag(source: string | undefined, output: string | undefined): boolean {
  return !source || source === "unknown" || source === output;
}

function finiteValue(value: string | undefined): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function compareAudioSync(source: MediaAnalysis, output: MediaAnalysis): AudioSyncComparison {
  const sameStreamCount = source.audio.length === output.audio.length;
  const sourceVideoStart = finiteValue(source.video.start_time) ?? 0;
  const outputVideoStart = finiteValue(output.video.start_time) ?? 0;
  let maxStartDelta = 0;
  let maxDurationDelta = 0;
  for (let index = 0; index < Math.min(source.audio.length, output.audio.length); index += 1) {
    const sourceAudio = source.audio[index];
    const outputAudio = output.audio[index];
    const sourceStart = finiteValue(sourceAudio.start_time);
    const outputStart = finiteValue(outputAudio.start_time);
    if (sourceStart !== undefined && outputStart !== undefined) {
      maxStartDelta = Math.max(
        maxStartDelta,
        Math.abs((sourceStart - sourceVideoStart) - (outputStart - outputVideoStart)),
      );
    }
    const sourceDuration = finiteValue(sourceAudio.duration);
    const outputDuration = finiteValue(outputAudio.duration);
    if (sourceDuration !== undefined && outputDuration !== undefined) {
      maxDurationDelta = Math.max(maxDurationDelta, Math.abs(sourceDuration - outputDuration));
    }
  }
  return { sameStreamCount, maxStartDelta, maxDurationDelta };
}

export async function verifyNativeOutput(options: {
  inputPath: string;
  outputPath: string;
  source: MediaAnalysis;
  ffmpegPath: string;
  ffprobePath: string;
  bitrateTolerance: number;
  runner?: CommandRunner;
}): Promise<VerificationReport> {
  const runner = options.runner ?? runCommand;
  const decode = await runner(options.ffmpegPath, [
    "-v", "error", "-i", options.outputPath,
    "-map", "0:v", "-map", "0:a?", "-f", "null", "-",
  ], { timeoutMs: 300_000 });
  const output = await probeMedia(options.outputPath, options.ffprobePath, runner);
  const [sourcePts, outputPts, outputPackets, audioSourceHash, audioOutputHash] = await Promise.all([
    readFramePts(options.inputPath, options.ffprobePath, runner),
    readFramePts(options.outputPath, options.ffprobePath, runner),
    readPackets(options.outputPath, options.ffprobePath, runner),
    audioPacketHash(options.inputPath, options.ffprobePath, runner),
    audioPacketHash(options.outputPath, options.ffprobePath, runner),
  ]);
  const timeline = compareTimelines(sourcePts, outputPts);
  const audioSync = compareAudioSync(options.source, output);
  const sourceFrameCount = frameCount(options.source, sourcePts);
  const outputFrameCount = frameCount(output, outputPts);
  const actualVideoBitrate = output.sourceVideoBitrate;
  const bitrateDelta = options.source.sourceVideoBitrate > 0
    ? (actualVideoBitrate - options.source.sourceVideoBitrate) / options.source.sourceVideoBitrate
    : 0;
  const bitrateWithinTolerance = options.source.sourceVideoBitrate <= 0
    || Math.abs(bitrateDelta) <= options.bitrateTolerance;
  const dtsMonotonic = dtsAreMonotonic(outputPackets);
  const audioBitstreamEqual = audioSourceHash === audioOutputHash;
  const decodePassed = decode.code === 0;
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!decodePassed) errors.push(`输出解码失败：${decode.stderr.trim() || `退出码 ${decode.code}`}`);
  if (!dtsMonotonic) errors.push("输出流 DTS 非单调");
  if (!timeline.sameCount || sourceFrameCount !== outputFrameCount) errors.push(`帧数不一致：${sourceFrameCount} → ${outputFrameCount}`);
  const frameTolerance = options.source.averageFrameRate > 0 ? 0.5 / options.source.averageFrameRate : 0.02;
  const syncTolerance = Math.max(0.05, frameTolerance);
  if (timeline.maxDelta > frameTolerance) errors.push(`PTS 偏差 ${timeline.maxDelta.toFixed(6)}s 超出 ${frameTolerance.toFixed(6)}s`);
  if (Math.abs(options.source.durationSeconds - output.durationSeconds) > Math.max(0.05, frameTolerance)) {
    errors.push(`时长不一致：${options.source.durationSeconds.toFixed(3)}s → ${output.durationSeconds.toFixed(3)}s`);
  }
  if (options.source.video.width !== output.video.width || options.source.video.height !== output.video.height) {
    errors.push(`分辨率不一致：${options.source.video.width}×${options.source.video.height} → ${output.video.width}×${output.video.height}`);
  }
  if (options.source.codecFamily && codecFamilyOf(output.video.codec_name) !== options.source.codecFamily) {
    errors.push(`codec 家族未继承：${options.source.video.codec_name} → ${output.video.codec_name}`);
  }
  if (!audioSync.sameStreamCount) errors.push(`音频流数量不一致：${options.source.audio.length} → ${output.audio.length}`);
  if (audioSync.maxStartDelta > syncTolerance) {
    errors.push(`音画起点偏差 ${audioSync.maxStartDelta.toFixed(6)}s 超出 ${syncTolerance.toFixed(6)}s`);
  }
  if (audioSync.maxDurationDelta > syncTolerance) {
    errors.push(`音频时长偏差 ${audioSync.maxDurationDelta.toFixed(6)}s 超出 ${syncTolerance.toFixed(6)}s`);
  }
  if (options.source.audio.length > 0 && !audioBitstreamEqual) errors.push("音频 packet bitstream 哈希不一致");
  if (options.source.video.pix_fmt !== output.video.pix_fmt) warnings.push(`像素格式变化：${options.source.video.pix_fmt} → ${output.video.pix_fmt}`);
  for (const [label, sourceValue, outputValue] of [
    ["color_primaries", options.source.video.color_primaries, output.video.color_primaries],
    ["color_transfer", options.source.video.color_transfer, output.video.color_transfer],
    ["color_space", options.source.video.color_space, output.video.color_space],
    ["color_range", options.source.video.color_range, output.video.color_range],
  ] as const) {
    if (!sameTag(sourceValue, outputValue)) warnings.push(`${label} 变化：${sourceValue} → ${outputValue}`);
  }
  if (!bitrateWithinTolerance) warnings.push(`视频码率偏差 ${(bitrateDelta * 100).toFixed(2)}%`);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sourceVideoBitrate: options.source.sourceVideoBitrate,
    actualVideoBitrate,
    bitrateDelta,
    bitrateWithinTolerance,
    sourceFrameCount,
    outputFrameCount,
    maxPtsDeltaSeconds: timeline.maxDelta,
    maxAvStartDeltaSeconds: audioSync.maxStartDelta,
    maxAudioDurationDeltaSeconds: audioSync.maxDurationDelta,
    audioSourceHash,
    audioOutputHash,
    audioBitstreamEqual,
    decodePassed,
    dtsMonotonic,
    output,
  };
}

export function correctedTargetBitrate(currentTarget: number, sourceBitrate: number, actualBitrate: number): number {
  if (sourceBitrate <= 0 || actualBitrate <= 0) return currentTarget;
  const corrected = currentTarget * (sourceBitrate / actualBitrate);
  return Math.round(Math.min(currentTarget * 2, Math.max(currentTarget * 0.5, corrected)));
}
