import type { CommandRunner } from "./process";
import { runCommand } from "./process";
import type { CodecFamily } from "./capabilities";

export interface ProbeStream {
  index: number;
  codec_type: "video" | "audio" | "subtitle" | "data" | "attachment";
  codec_name?: string;
  codec_long_name?: string;
  profile?: string;
  width?: number;
  height?: number;
  pix_fmt?: string;
  sample_aspect_ratio?: string;
  display_aspect_ratio?: string;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  time_base?: string;
  start_time?: string;
  duration?: string;
  bit_rate?: string;
  nb_frames?: string;
  nb_read_frames?: string;
  color_range?: string;
  color_space?: string;
  color_transfer?: string;
  color_primaries?: string;
  tags?: Record<string, string>;
}

export interface ProbeFormat {
  filename?: string;
  format_name?: string;
  duration?: string;
  size?: string;
  bit_rate?: string;
  tags?: Record<string, string>;
}

export interface MediaProbe {
  streams: ProbeStream[];
  format: ProbeFormat;
  chapters?: Array<Record<string, unknown>>;
}

export interface MediaAnalysis {
  probe: MediaProbe;
  video: ProbeStream;
  audio: ProbeStream[];
  subtitles: ProbeStream[];
  codecFamily?: CodecFamily;
  durationSeconds: number;
  sourceVideoBitrate: number;
  averageFrameRate: number;
  nominalFrameRate: number;
  isVariableFrameRate: boolean;
}

function numberValue(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function ratioValue(value: string | undefined): number {
  if (!value) return 0;
  const [numerator, denominator] = value.split("/").map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return 0;
  return numerator / denominator;
}

export function codecFamilyOf(codecName: string | undefined): CodecFamily | undefined {
  if (codecName === "h264" || codecName === "avc1") return "h264";
  if (codecName === "hevc" || codecName === "h265" || codecName === "hev1") return "hevc";
  return undefined;
}

function estimateVideoBitrate(probe: MediaProbe, video: ProbeStream, duration: number): number {
  const streamBitrate = numberValue(video.bit_rate);
  if (streamBitrate > 0) return streamBitrate;
  const containerBitrate = numberValue(probe.format.bit_rate);
  const audioBitrate = probe.streams
    .filter((stream) => stream.codec_type === "audio")
    .reduce((total, stream) => total + numberValue(stream.bit_rate), 0);
  if (containerBitrate > audioBitrate) return containerBitrate - audioBitrate;
  const bytes = numberValue(probe.format.size);
  return duration > 0 && bytes > 0 ? (bytes * 8) / duration : 0;
}

export function analyzeProbe(probe: MediaProbe): MediaAnalysis {
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  if (!video || !video.width || !video.height) throw new Error("输入文件没有可处理的视频流");
  const durationSeconds = numberValue(video.duration) || numberValue(probe.format.duration);
  const averageFrameRate = ratioValue(video.avg_frame_rate);
  const nominalFrameRate = ratioValue(video.r_frame_rate);
  const difference = Math.abs(averageFrameRate - nominalFrameRate);
  const isVariableFrameRate = averageFrameRate > 0
    && nominalFrameRate > 0
    && difference / nominalFrameRate > 0.001;
  return {
    probe,
    video,
    audio: probe.streams.filter((stream) => stream.codec_type === "audio"),
    subtitles: probe.streams.filter((stream) => stream.codec_type === "subtitle"),
    codecFamily: codecFamilyOf(video.codec_name),
    durationSeconds,
    sourceVideoBitrate: Math.round(estimateVideoBitrate(probe, video, durationSeconds)),
    averageFrameRate,
    nominalFrameRate,
    isVariableFrameRate,
  };
}

export async function probeMedia(
  filePath: string,
  ffprobePath: string,
  runner: CommandRunner = runCommand,
): Promise<MediaAnalysis> {
  const result = await runner(ffprobePath, [
    "-v", "error",
    "-count_frames",
    "-show_streams",
    "-show_format",
    "-show_chapters",
    "-print_format", "json",
    filePath,
  ], { timeoutMs: 30_000 });
  if (result.code !== 0) throw new Error(`ffprobe 分析失败：${result.stderr.trim() || `退出码 ${result.code}`}`);
  try {
    return analyzeProbe(JSON.parse(result.stdout) as MediaProbe);
  } catch (error) {
    throw new Error(`无法解析媒体信息：${error instanceof Error ? error.message : "未知错误"}`);
  }
}
