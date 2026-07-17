import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { processVideo, terminateVideoEngine } from "../lib/ffmpeg/processor";
import {
  processVideoWithSidecar,
  processVideoWithVeoSidecar,
  setSidecarConcurrency,
  type SidecarConnection,
} from "../lib/sidecar/client";
import { runBoundedVideoQueue } from "../lib/video/batchQueue";
import type { QueueConcurrency } from "../lib/video/concurrency";
import type { BatchItemProcessingState, VideoQueueItem } from "../types/video";

export type ProcessingMode = "browser" | "native" | "veo";

interface BatchProcessorOptions {
  mode?: ProcessingMode;
  sidecar?: SidecarConnection;
  concurrency?: QueueConcurrency;
  veoForceAllFrames?: boolean;
}

const READY_STATE: BatchItemProcessingState = {
  phase: "idle",
  progress: 0,
  message: "等待开始",
  result: null,
};

function friendlyError(reason: unknown, mode: ProcessingMode): string {
  const message = reason instanceof Error ? reason.message : "未知错误";
  if (mode === "native") return `本地加速处理失败：${message}。可切换到浏览器模式继续处理。`;
  if (mode === "veo") return `VEO 实验处理失败：${message}。请检查本地服务或切换处理模式后重试。`;
  if (/memory|allocation|out of bounds/i.test(message)) {
    return "浏览器可用内存不足，请关闭其他页面或换用更短的视频。";
  }
  if (/fetch|load|network/i.test(message)) {
    return "本地视频引擎加载失败，请刷新页面后重试。";
  }
  return `处理失败：${message}`;
}

function progressPhase(mode: ProcessingMode, progress: number): BatchItemProcessingState["phase"] {
  if (progress <= 0.01) return "loading-engine";
  if (mode === "browser" && progress < 0.1) return "loading-engine";
  return "processing";
}

export function useBatchVideoProcessor(options: BatchProcessorOptions = {}) {
  const mode = options.mode ?? "browser";
  const sidecar = options.sidecar;
  const concurrency = mode === "browser" ? 1 : options.concurrency ?? 1;
  const [states, setStates] = useState<Record<string, BatchItemProcessingState>>({});
  const statesRef = useRef(states);
  const controllerRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);
  const mountedRef = useRef(true);

  const replaceStates = useCallback((update: (current: Record<string, BatchItemProcessingState>) => Record<string, BatchItemProcessingState>) => {
    if (!mountedRef.current) return;
    const next = update(statesRef.current);
    statesRef.current = next;
    setStates(next);
  }, []);

  const updateItem = useCallback((id: string, update: BatchItemProcessingState) => {
    replaceStates((current) => ({ ...current, [id]: update }));
  }, [replaceStates]);

  const run = useCallback(async (items: VideoQueueItem[], requestedIds?: string[]) => {
    controllerRef.current?.abort();
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    const requested = requestedIds ? new Set(requestedIds) : null;
    const targets = items.filter((item) => {
      if (requested && !requested.has(item.id)) return false;
      return statesRef.current[item.id]?.phase !== "success" || Boolean(requested);
    });
    if (targets.length === 0) return;

    const controller = new AbortController();
    controllerRef.current = controller;
    const isCurrent = () => mountedRef.current && runIdRef.current === runId;

    replaceStates((current) => {
      const next = { ...current };
      for (const item of targets) {
        next[item.id] = { phase: "queued", progress: 0, message: "队列中等待", result: null };
      }
      return next;
    });

    if (mode !== "browser") {
      try {
        if (!sidecar) throw new Error("尚未连接本地 sidecar");
        await setSidecarConcurrency(sidecar, concurrency, controller.signal);
      } catch (reason) {
        if (isCurrent()) {
          replaceStates((current) => {
            const next = { ...current };
            for (const item of targets) {
              next[item.id] = {
                phase: "error",
                progress: 0,
                message: "任务池配置失败",
                error: friendlyError(reason, mode),
                result: null,
              };
            }
            return next;
          });
        }
        if (controllerRef.current === controller) controllerRef.current = null;
        return;
      }
    }

    const processItem = mode === "native"
      ? (file: File, region: VideoQueueItem["region"], onProgress: (progress: number, message: string) => void, signal: AbortSignal) => {
          if (!sidecar) throw new Error("尚未连接本地 sidecar");
          return processVideoWithSidecar(file, region, sidecar, onProgress, signal).then((blob) => ({
            blob,
            mode: "native" as const,
            outputName: file.name.replace(/\.mp4$/i, "-clean.mp4"),
          }));
        }
      : mode === "veo"
        ? (file: File, _region: VideoQueueItem["region"], onProgress: (progress: number, message: string) => void, signal: AbortSignal) => {
            if (!sidecar) throw new Error("尚未连接本地 sidecar");
            return processVideoWithVeoSidecar(file, sidecar, onProgress, signal, {
              forceAllFrames: options.veoForceAllFrames,
            }).then(({ blob, outputName, details }) => ({
              blob,
              mode: "veo" as const,
              outputName,
              veo: details,
            }));
          }
      : (file: File, region: VideoQueueItem["region"], onProgress: (progress: number, message: string) => void, signal: AbortSignal) => processVideo(
          file,
          region,
          ({ progress, message }) => onProgress(progress, message),
          signal,
        ).then((blob) => ({
          blob,
          mode: "browser" as const,
          outputName: file.name.replace(/\.mp4$/i, "-clean.mp4"),
        }));

    await runBoundedVideoQueue(
      targets,
      processItem,
      {
        onStart: (item) => {
          if (isCurrent()) updateItem(item.id, {
            phase: "loading-engine",
            progress: 0,
            message: mode === "browser" ? "正在启动浏览器引擎…" : "正在连接本机 sidecar…",
            result: null,
          });
        },
        onProgress: (item, progress, message) => {
          if (isCurrent()) updateItem(item.id, {
            phase: progressPhase(mode, progress),
            progress,
            message,
            result: null,
          });
        },
        onSuccess: (item, result) => {
          if (isCurrent()) updateItem(item.id, {
            phase: "success",
            progress: 1,
            message: "水印区域已完成修复",
            result,
          });
        },
        onError: (item, reason) => {
          if (isCurrent()) updateItem(item.id, {
            phase: "error",
            progress: 0,
            message: "处理失败",
            error: friendlyError(reason, mode),
            result: null,
          });
        },
        onCancelled: (cancelledItems) => {
          if (!isCurrent()) return;
          replaceStates((current) => {
            const next = { ...current };
            for (const item of cancelledItems) {
              next[item.id] = {
                phase: "cancelled",
                progress: 0,
                message: "处理已取消",
                result: null,
              };
            }
            return next;
          });
        },
      },
      controller.signal,
      concurrency,
    );

    if (controllerRef.current === controller) controllerRef.current = null;
  }, [concurrency, mode, options.veoForceAllFrames, replaceStates, sidecar, updateItem]);

  const cancel = useCallback(() => controllerRef.current?.abort(), []);

  const resetItem = useCallback((id: string) => {
    updateItem(id, READY_STATE);
  }, [updateItem]);

  const removeItem = useCallback((id: string) => {
    replaceStates((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, [replaceStates]);

  const resetAll = useCallback(() => {
    controllerRef.current?.abort();
    statesRef.current = {};
    setStates({});
  }, []);

  const isRunning = useMemo(() => Object.values(states).some(({ phase }) => (
    phase === "queued" || phase === "loading-engine" || phase === "processing"
  )), [states]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      terminateVideoEngine();
    };
  }, []);

  return { states, isRunning, run, cancel, resetItem, removeItem, resetAll };
}
