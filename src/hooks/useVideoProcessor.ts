import { useCallback, useEffect, useRef, useState } from "react";
import { processVideo, terminateVideoEngine } from "../lib/ffmpeg/processor";
import type { NormalizedRegion, ProcessingState, VideoAsset } from "../types/video";

const IDLE_STATE: ProcessingState = {
  phase: "idle",
  progress: 0,
  message: "等待开始",
};

function friendlyError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : "未知错误";
  if (/memory|allocation|out of bounds/i.test(message)) {
    return "浏览器可用内存不足，请关闭其他页面或换用更短的视频。";
  }
  if (/fetch|load|network/i.test(message)) {
    return "本地视频引擎加载失败，请刷新页面后重试。";
  }
  return `处理失败：${message}`;
}

export function useVideoProcessor() {
  const [state, setState] = useState<ProcessingState>(IDLE_STATE);
  const [result, setResult] = useState<Blob | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const clearResult = useCallback(() => {
    setResult(null);
    setState(IDLE_STATE);
  }, []);

  const run = useCallback(async (asset: VideoAsset, region: NormalizedRegion) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setResult(null);
    setState({ phase: "loading-engine", progress: 0, message: "正在启动本地引擎…" });

    try {
      const blob = await processVideo(asset.file, region, ({ progress, message }) => {
        setState({
          phase: progress < 0.1 ? "loading-engine" : "processing",
          progress,
          message,
        });
      }, controller.signal);
      if (controller.signal.aborted) return;
      setResult(blob);
      setState({ phase: "success", progress: 1, message: "水印区域已完成修复" });
    } catch (reason) {
      if (controller.signal.aborted || (reason instanceof DOMException && reason.name === "AbortError")) {
        setState({ phase: "cancelled", progress: 0, message: "处理已取消" });
      } else {
        setState({ phase: "error", progress: 0, message: "处理失败", error: friendlyError(reason) });
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => controllerRef.current?.abort(), []);

  useEffect(() => () => {
    controllerRef.current?.abort();
    terminateVideoEngine();
  }, []);

  return { state, result, run, cancel, clearResult };
}
