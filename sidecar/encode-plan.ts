import type { NormalizedRegion } from "../src/types/video";
import { regionToPixels } from "../src/lib/video/region";
import type { NativeCapabilities, CodecFamily } from "./capabilities";
import type { MediaAnalysis, ProbeStream } from "./media";

export interface NativeEncodePlan {
  args: string[];
  encoder: string;
  codecFamily: CodecFamily;
  targetBitrate: number;
  pixelFormat: string;
  hardware: boolean;
  warnings: string[];
}

const MP4_COPY_SUBTITLES = new Set(["mov_text", "tx3g"]);

function knownColor(value: string | undefined): value is string {
  return Boolean(value && value !== "unknown" && value !== "reserved");
}

function chooseCodecFamily(analysis: MediaAnalysis, capabilities: NativeCapabilities): CodecFamily {
  if (analysis.codecFamily && capabilities.selected[analysis.codecFamily]) return analysis.codecFamily;
  if (capabilities.selected.h264) return "h264";
  if (capabilities.selected.hevc) return "hevc";
  throw new Error("没有通过运行时编码测试的 H.264 或 HEVC 编码器");
}

function sourcePixelFormat(stream: ProbeStream, family: CodecFamily): string {
  if (stream.pix_fmt) return stream.pix_fmt;
  return family === "hevc" ? "yuv420p10le" : "yuv420p";
}

function encoderOptions(encoder: string, targetBitrate: number): string[] {
  const bitrate = String(targetBitrate);
  if (encoder.endsWith("_videotoolbox")) {
    return ["-allow_sw", "0", "-realtime", "0", "-b:v", bitrate];
  }
  if (encoder.endsWith("_nvenc")) {
    return ["-preset", "p5", "-tune", "hq", "-rc", "vbr", "-b:v", bitrate];
  }
  return ["-preset", "medium", "-b:v", bitrate];
}

export function buildNativeDelogoPlan(options: {
  inputPath: string;
  outputPath: string;
  region: NormalizedRegion;
  analysis: MediaAnalysis;
  capabilities: NativeCapabilities;
  targetBitrate?: number;
}): NativeEncodePlan {
  const { analysis, capabilities } = options;
  const codecFamily = chooseCodecFamily(analysis, capabilities);
  const encoder = capabilities.selected[codecFamily];
  if (!encoder) throw new Error(`没有可用的 ${codecFamily} 编码器`);
  const hardware = capabilities.encoders.some((item) => item.name === encoder && item.available && item.kind === "hardware");
  const targetBitrate = Math.max(100_000, Math.round(options.targetBitrate ?? analysis.sourceVideoBitrate));
  const pixelFormat = sourcePixelFormat(analysis.video, codecFamily);
  const pixels = regionToPixels(options.region, analysis.video.width!, analysis.video.height!);
  const filters = [`delogo=x=${pixels.x}:y=${pixels.y}:w=${pixels.width}:h=${pixels.height}`];
  if (analysis.video.sample_aspect_ratio && analysis.video.sample_aspect_ratio !== "0:1") {
    filters.push(`setsar=${analysis.video.sample_aspect_ratio}`);
  }
  const warnings: string[] = [];
  if (analysis.codecFamily && analysis.codecFamily !== codecFamily) {
    warnings.push(`源编码 ${analysis.video.codec_name} 无可用编码器，回退为 ${codecFamily}`);
  } else if (!analysis.codecFamily) {
    warnings.push(`无法继承源编码 ${analysis.video.codec_name ?? "unknown"}，输出使用 ${codecFamily}`);
  }
  const incompatibleSubtitleCount = analysis.subtitles.filter((stream) => (
    !MP4_COPY_SUBTITLES.has(stream.codec_name ?? "")
  )).length;
  if (incompatibleSubtitleCount > 0) {
    warnings.push(`${incompatibleSubtitleCount} 条字幕流与 MP4 直接复制不兼容，未写入输出`);
  }

  const args = [
    "-hide_banner", "-y", "-copyts",
    "-i", options.inputPath,
    "-map", "0:v:0",
    "-map", "0:a?",
  ];
  for (const subtitle of analysis.subtitles.filter((stream) => MP4_COPY_SUBTITLES.has(stream.codec_name ?? ""))) {
    args.push("-map", `0:${subtitle.index}?`);
  }
  args.push(
    "-map_metadata", "0",
    "-map_chapters", "0",
    "-vf", filters.join(","),
    "-c:v", encoder,
    ...encoderOptions(encoder, targetBitrate),
    "-pix_fmt", pixelFormat,
    "-fps_mode", "passthrough",
    "-c:a", "copy",
  );
  if (analysis.subtitles.some((stream) => MP4_COPY_SUBTITLES.has(stream.codec_name ?? ""))) {
    args.push("-c:s", "copy");
  }
  if (codecFamily === "hevc") args.push("-tag:v", "hvc1");
  if (knownColor(analysis.video.color_primaries)) args.push("-color_primaries", analysis.video.color_primaries);
  if (knownColor(analysis.video.color_transfer)) args.push("-color_trc", analysis.video.color_transfer);
  if (knownColor(analysis.video.color_space)) args.push("-colorspace", analysis.video.color_space);
  if (knownColor(analysis.video.color_range)) args.push("-color_range", analysis.video.color_range);
  args.push("-avoid_negative_ts", "disabled", "-movflags", "+faststart+use_metadata_tags", options.outputPath);

  return { args, encoder, codecFamily, targetBitrate, pixelFormat, hardware, warnings };
}
