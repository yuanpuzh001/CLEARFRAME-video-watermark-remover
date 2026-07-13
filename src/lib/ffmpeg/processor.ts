import { FFmpeg, FFFSType } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import type { NormalizedRegion } from "../../types/video";
import { buildDelogoCommand } from "./commands";

export interface ProcessProgress {
  progress: number;
  message: string;
}

type ProgressCallback = (event: ProcessProgress) => void;

let engine: FFmpeg | null = null;
let enginePromise: Promise<FFmpeg> | null = null;
let engineMode: "mt" | "st" | null = null;

function assetUrl(path: string): string {
  return new URL(path, window.location.origin).href;
}

function abortError(): DOMException {
  return new DOMException("处理已取消", "AbortError");
}

async function loadEngine(
  onProgress: ProgressCallback,
  signal: AbortSignal,
  forceSingleThread = false,
): Promise<FFmpeg> {
  if (engine?.loaded) return engine;
  if (enginePromise) return enginePromise;

  enginePromise = (async () => {
    onProgress({ progress: 0.02, message: "正在加载本地视频引擎…" });
    // core-mt 0.12.10 is opt-in until its current Chromium pthread signature
    // mismatch is resolved. The stable single-thread core remains the default.
    const threadOptIn = new URLSearchParams(window.location.search).get("threads") === "1";
    const canUseThreads = threadOptIn
      && window.crossOriginIsolated
      && typeof SharedArrayBuffer !== "undefined";
    const modes = !forceSingleThread && canUseThreads ? ["mt", "st"] as const : ["st"] as const;
    let lastError: unknown;

    for (const mode of modes) {
      if (signal.aborted) throw abortError();
      const candidate = new FFmpeg();
      try {
        await candidate.load(mode === "mt" ? {
          coreURL: assetUrl("/ffmpeg/mt/ffmpeg-core.js"),
          wasmURL: assetUrl("/ffmpeg/mt/ffmpeg-core.wasm"),
          workerURL: assetUrl("/ffmpeg/mt/ffmpeg-core.worker.js"),
        } : {
          coreURL: assetUrl("/ffmpeg/st/ffmpeg-core.js"),
          wasmURL: assetUrl("/ffmpeg/st/ffmpeg-core.wasm"),
        }, { signal });
        engine = candidate;
        engineMode = mode;
        onProgress({
          progress: 0.08,
          message: mode === "mt" ? "多线程引擎已就绪" : "兼容模式引擎已就绪",
        });
        return candidate;
      } catch (reason) {
        candidate.terminate();
        lastError = reason;
        if (signal.aborted) throw abortError();
      }
    }
    throw lastError instanceof Error ? lastError : new Error("视频引擎加载失败");
  })().finally(() => {
    enginePromise = null;
  });

  return enginePromise;
}

function readDimensions(file: File, signal: AbortSignal): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const cleanup = () => URL.revokeObjectURL(url);
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    video.onloadedmetadata = () => {
      signal.removeEventListener("abort", onAbort);
      cleanup();
      resolve({ width: video.videoWidth, height: video.videoHeight });
    };
    video.onerror = () => {
      signal.removeEventListener("abort", onAbort);
      cleanup();
      reject(new Error("无法读取视频尺寸"));
    };
    video.preload = "metadata";
    video.src = url;
  });
}

async function processVideoAttempt(
  file: File,
  region: NormalizedRegion,
  onProgress: ProgressCallback,
  signal: AbortSignal,
  forceSingleThread: boolean,
): Promise<Blob> {
  const dimensions = await readDimensions(file, signal);
  const ffmpeg = await loadEngine(onProgress, signal, forceSingleThread);
  const mountPoint = "/input";
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const mountedInput = `${mountPoint}/${safeName}`;
  const memoryInput = `input-${crypto.randomUUID()}.mp4`;
  const outputPath = `output-${crypto.randomUUID()}.mp4`;
  let inputPath = mountedInput;
  let mounted = false;
  let wroteInput = false;

  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress({
      progress: Math.max(0.1, Math.min(0.96, 0.1 + progress * 0.86)),
      message: progress < 0.98 ? "正在逐帧修复水印区域…" : "正在封装输出视频…",
    });
  };
  ffmpeg.on("progress", progressHandler);

  const onAbort = () => {
    ffmpeg.terminate();
    engine = null;
    engineMode = null;
  };
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    onProgress({ progress: 0.09, message: "正在准备本地视频…" });
    try {
      await ffmpeg.createDir(mountPoint);
      await ffmpeg.mount(FFFSType.WORKERFS, { files: [file] }, mountPoint);
      mounted = true;
    } catch {
      inputPath = memoryInput;
      await ffmpeg.writeFile(memoryInput, await fetchFile(file), { signal });
      wroteInput = true;
    }

    const exitCode = await ffmpeg.exec(
      buildDelogoCommand(inputPath, outputPath, region, dimensions.width, dimensions.height),
      -1,
      { signal },
    );
    if (exitCode !== 0) throw new Error(`视频处理失败（FFmpeg 退出码 ${exitCode}）`);
    if (signal.aborted) throw abortError();

    onProgress({ progress: 0.98, message: "正在读取处理结果…" });
    const data = await ffmpeg.readFile(outputPath, "binary", { signal });
    if (typeof data === "string") throw new Error("处理结果格式异常");
    onProgress({ progress: 1, message: "修复完成" });
    return new Blob([new Uint8Array(data)], { type: "video/mp4" });
  } catch (reason) {
    if (signal.aborted || (reason instanceof DOMException && reason.name === "AbortError")) {
      throw abortError();
    }
    throw reason;
  } finally {
    signal.removeEventListener("abort", onAbort);
    ffmpeg.off("progress", progressHandler);
    if (ffmpeg.loaded) {
      try { await ffmpeg.deleteFile(outputPath); } catch { /* output may not exist */ }
      if (mounted) {
        try { await ffmpeg.unmount(mountPoint); } catch { /* already released */ }
        try { await ffmpeg.deleteDir(mountPoint); } catch { /* already released */ }
      }
      if (wroteInput) {
        try { await ffmpeg.deleteFile(memoryInput); } catch { /* already released */ }
      }
    }
  }
}

export async function processVideo(
  file: File,
  region: NormalizedRegion,
  onProgress: ProgressCallback,
  signal: AbortSignal,
): Promise<Blob> {
  try {
    return await processVideoAttempt(file, region, onProgress, signal, false);
  } catch (reason) {
    if (signal.aborted || engineMode !== "mt") throw reason;
    terminateVideoEngine();
    onProgress({ progress: 0.04, message: "多线程模式不可用，正在切换兼容模式…" });
    return processVideoAttempt(file, region, onProgress, signal, true);
  }
}

export function terminateVideoEngine(): void {
  engine?.terminate();
  engine = null;
  enginePromise = null;
  engineMode = null;
}
