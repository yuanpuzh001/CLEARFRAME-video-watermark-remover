import { randomBytes } from "node:crypto";

export interface SidecarConfig {
  host: "127.0.0.1";
  port: number;
  token: string;
  ffmpegPath: string;
  ffprobePath: string;
  bitrateTolerance: number;
  allowedOrigins: string[];
  maxUploadBytes: number;
}

function optionValue(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return args.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? "3210");
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("sidecar 端口必须是 1024 到 65535 之间的整数");
  }
  return port;
}

function parseTolerance(value: string | undefined): number {
  const tolerance = Number(value ?? "0.10");
  if (!Number.isFinite(tolerance) || tolerance < 0.05 || tolerance > 0.25) {
    throw new Error("码率容差必须介于 0.05 和 0.25 之间");
  }
  return tolerance;
}

function parseMaxUploadBytes(value: string | undefined): number {
  const bytes = Number(value ?? 500 * 1024 * 1024);
  if (!Number.isSafeInteger(bytes) || bytes < 1024 * 1024) {
    throw new Error("sidecar 文件上限必须是至少 1MB 的安全整数");
  }
  return bytes;
}

export function createSidecarConfig(
  args = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): SidecarConfig {
  const origins = (env.CLEARFRAME_ALLOWED_ORIGINS ?? "http://127.0.0.1:5173,http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return {
    host: "127.0.0.1",
    port: parsePort(optionValue(args, "port") ?? env.CLEARFRAME_SIDECAR_PORT),
    token: env.CLEARFRAME_PAIRING_TOKEN || randomBytes(24).toString("base64url"),
    ffmpegPath: optionValue(args, "ffmpeg") ?? env.CLEARFRAME_FFMPEG_PATH ?? "ffmpeg",
    ffprobePath: optionValue(args, "ffprobe") ?? env.CLEARFRAME_FFPROBE_PATH ?? "ffprobe",
    bitrateTolerance: parseTolerance(optionValue(args, "bitrate-tolerance") ?? env.CLEARFRAME_BITRATE_TOLERANCE),
    allowedOrigins: origins,
    maxUploadBytes: parseMaxUploadBytes(env.CLEARFRAME_MAX_UPLOAD_BYTES),
  };
}
