import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rmdir, stat, unlink } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { NormalizedRegion } from "../src/types/video";
import type { NativeCapabilities } from "./capabilities";
import type { SidecarConfig } from "./config";
import { runNativeDelogoJob, type NativeJobProgress, type NativeJobResult } from "./native-job";

type JobPhase = "uploading" | "queued" | "processing" | "verifying" | "success" | "error" | "cancelled";

interface SidecarJob {
  id: string;
  fileName: string;
  outputName: string;
  phase: JobPhase;
  progress: number;
  message: string;
  error?: string;
  result?: NativeJobResult;
  inputPath: string;
  outputPath: string;
  directory: string;
  region: NormalizedRegion;
  controller: AbortController;
  deleteRequested: boolean;
}

type NativeJobRunner = typeof runNativeDelogoJob;

function safeName(value: string): string {
  const leaf = basename(value || "video.mp4");
  return leaf.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-160) || "video.mp4";
}

function cleanOutputName(fileName: string): string {
  const stem = fileName.replace(/\.mp4$/i, "");
  return `${stem}-clean.mp4`;
}

function parseRegion(value: string | undefined): NormalizedRegion {
  if (!value || value.length > 500) throw new Error("缺少有效的水印区域");
  const parsed = JSON.parse(value) as Partial<NormalizedRegion>;
  const region = { x: Number(parsed.x), y: Number(parsed.y), width: Number(parsed.width), height: Number(parsed.height) };
  if (Object.values(region).some((number) => !Number.isFinite(number))) throw new Error("水印区域包含无效数值");
  if (region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0
    || region.x + region.width > 1 || region.y + region.height > 1) {
    throw new Error("水印区域超出视频范围");
  }
  return region;
}

function tokenMatches(request: IncomingMessage, expected: string): boolean {
  const actual = request.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function originAllowed(request: IncomingMessage, config: SidecarConfig): boolean {
  const origin = request.headers.origin;
  return !origin || config.allowedOrigins.includes(origin);
}

function applyHeaders(response: ServerResponse, request: IncomingMessage, config: SidecarConfig): void {
  const origin = request.headers.origin;
  if (origin && config.allowedOrigins.includes(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function publicJob(job: SidecarJob): Record<string, unknown> {
  return {
    id: job.id,
    fileName: job.fileName,
    outputName: job.outputName,
    phase: job.phase,
    progress: job.progress,
    message: job.message,
    error: job.error,
    result: job.result ? {
      encoder: job.result.plan.encoder,
      hardware: job.result.plan.hardware,
      encoderFallback: job.result.encoderFallback,
      bitrateAttempts: job.result.bitrateAttempts,
      elapsedMs: job.result.elapsedMs,
      realtimeFactor: job.result.realtimeFactor,
      verification: job.result.verification,
    } : undefined,
  };
}

async function removeFile(path: string): Promise<void> {
  try { await unlink(path); } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
}

export async function createSidecarServer(options: {
  config: SidecarConfig;
  capabilities: NativeCapabilities;
  jobRunner?: NativeJobRunner;
}): Promise<{ server: Server; jobs: Map<string, SidecarJob>; close: () => Promise<void> }> {
  const { config, capabilities } = options;
  const jobRunner = options.jobRunner ?? runNativeDelogoJob;
  const tempRoot = await mkdtemp(join(tmpdir(), "clearframe-sidecar-"));
  const jobs = new Map<string, SidecarJob>();

  const cleanupJob = async (job: SidecarJob) => {
    await removeFile(job.inputPath);
    await removeFile(job.outputPath);
    await removeFile(`${job.outputPath}.attempt-1.mp4`);
    await removeFile(`${job.outputPath}.attempt-2.mp4`);
    try { await rmdir(job.directory); } catch { /* active process may still hold a file */ }
    jobs.delete(job.id);
  };

  const runJob = async (job: SidecarJob) => {
    job.phase = "processing";
    try {
      job.result = await jobRunner({
        inputPath: job.inputPath,
        outputPath: job.outputPath,
        region: job.region,
        capabilities,
        config,
        signal: job.controller.signal,
        onProgress: (progress: NativeJobProgress) => {
          job.progress = progress.progress;
          job.message = progress.message;
          job.phase = progress.message.includes("验证") ? "verifying" : "processing";
        },
      });
      job.phase = "success";
      job.progress = 1;
      job.message = "本地加速处理完成";
    } catch (error) {
      if (job.controller.signal.aborted) {
        job.phase = "cancelled";
        job.message = "处理已取消";
      } else {
        job.phase = "error";
        job.error = error instanceof Error ? error.message : "本地处理失败";
        job.message = job.error;
      }
    } finally {
      if (job.deleteRequested) await cleanupJob(job);
    }
  };

  const server = createServer(async (request, response) => {
    try {
      applyHeaders(response, request, config);
    if (!originAllowed(request, config)) return sendJson(response, 403, { error: "不允许的请求来源" });
    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      response.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
      response.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type,X-Clearframe-Filename,X-Clearframe-Region");
      return response.end();
    }
    if (!tokenMatches(request, config.token)) return sendJson(response, 401, { error: "配对令牌无效" });
    const url = new URL(request.url ?? "/", `http://${config.host}:${config.port}`);
    if (request.method === "GET" && url.pathname === "/v1/health") {
      return sendJson(response, 200, {
        ready: true,
        mode: "native-sidecar",
        host: config.host,
        bitrateTolerance: config.bitrateTolerance,
        capabilities,
      });
    }
    if (request.method === "POST" && url.pathname === "/v1/jobs") {
      const contentLength = Number(request.headers["content-length"] ?? 0);
      if (contentLength <= 0 || contentLength > config.maxUploadBytes) {
        return sendJson(response, 413, { error: "视频大小无效或超出 sidecar 限制" });
      }
      let region: NormalizedRegion;
      try {
        region = parseRegion(request.headers["x-clearframe-region"] as string | undefined);
      } catch (error) {
        return sendJson(response, 400, { error: error instanceof Error ? error.message : "水印区域无效" });
      }
      const id = randomUUID();
      const fileName = safeName(request.headers["x-clearframe-filename"] as string | undefined ?? "video.mp4");
      const directory = join(tempRoot, id);
      await mkdir(directory);
      const inputPath = join(directory, fileName);
      const outputName = cleanOutputName(fileName);
      const outputPath = join(directory, outputName);
      const job: SidecarJob = {
        id, fileName, outputName, phase: "uploading", progress: 0,
        message: "正在接收本地视频…", inputPath, outputPath, directory, region,
        controller: new AbortController(), deleteRequested: false,
      };
      jobs.set(id, job);
      let bytes = 0;
      const limiter = new Transform({
        transform(chunk, _encoding, callback) {
          bytes += chunk.length;
          if (bytes > config.maxUploadBytes) callback(new Error("视频超出 sidecar 大小限制"));
          else callback(null, chunk);
        },
      });
      try {
        await pipeline(request, limiter, createWriteStream(inputPath, { flags: "wx" }));
      } catch (error) {
        jobs.delete(id);
        await removeFile(inputPath);
        await rmdir(directory);
        return sendJson(response, 400, { error: error instanceof Error ? error.message : "视频接收失败" });
      }
      job.phase = "queued";
      job.progress = 0.01;
      job.message = "等待本地处理…";
      void runJob(job);
      return sendJson(response, 202, publicJob(job));
    }
    const match = url.pathname.match(/^\/v1\/jobs\/([0-9a-f-]+)(\/output)?$/i);
    if (match) {
      const job = jobs.get(match[1]);
      if (!job) return sendJson(response, 404, { error: "任务不存在" });
      if (request.method === "GET" && match[2] === "/output") {
        if (job.phase !== "success") return sendJson(response, 409, { error: "结果尚未就绪" });
        const info = await stat(job.outputPath);
        response.statusCode = 200;
        response.setHeader("Content-Type", "video/mp4");
        response.setHeader("Content-Length", String(info.size));
        response.setHeader("Content-Disposition", `attachment; filename="${job.outputName}"`);
        return createReadStream(job.outputPath).pipe(response);
      }
      if (request.method === "GET" && !match[2]) return sendJson(response, 200, publicJob(job));
      if (request.method === "DELETE" && !match[2]) {
        job.deleteRequested = true;
        if (job.phase === "processing" || job.phase === "verifying" || job.phase === "queued" || job.phase === "uploading") {
          job.controller.abort();
          job.phase = "cancelled";
          job.message = "正在取消处理…";
        } else {
          await cleanupJob(job);
        }
        return sendJson(response, 202, publicJob(job));
      }
    }
    return sendJson(response, 404, { error: "接口不存在" });
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined);
        return;
      }
      return sendJson(response, 500, { error: error instanceof Error ? error.message : "sidecar 内部错误" });
    }
  });

  const close = async () => {
    for (const job of jobs.values()) {
      job.controller.abort();
      await cleanupJob(job);
    }
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    try { await rmdir(tempRoot); } catch { /* leave only if an active process has not exited */ }
  };
  return { server, jobs, close };
}
