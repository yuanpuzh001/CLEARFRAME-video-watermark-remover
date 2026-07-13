import { CircleStop, Download, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import type { ProcessingMode } from "../hooks/useBatchVideoProcessor";
import type { SidecarHealth } from "../lib/sidecar/client";
import { WORKFLOW_LABELS, WORKFLOW_SECTIONS } from "../lib/ui/workflowLabels";
import type { ProcessingState } from "../types/video";
import { ProcessingModeControl, type SidecarConnectionState } from "./ProcessingModeControl";

interface ProcessPanelProps {
  state: ProcessingState;
  total: number;
  completed: number;
  remaining: number;
  downloadingAll: boolean;
  mode: ProcessingMode;
  sidecarUrl: string;
  sidecarToken: string;
  sidecarState: SidecarConnectionState;
  sidecarMessage: string;
  sidecarHealth: SidecarHealth | null;
  onProcess: () => void;
  onCancel: () => void;
  onClearQueue: () => void;
  onDownloadAll: () => void;
  onModeChange: (mode: ProcessingMode) => void;
  onSidecarUrlChange: (value: string) => void;
  onSidecarTokenChange: (value: string) => void;
  onConnectSidecar: () => void;
}

export function ProcessPanel({
  state,
  total,
  completed,
  remaining,
  downloadingAll,
  mode,
  sidecarUrl,
  sidecarToken,
  sidecarState,
  sidecarMessage,
  sidecarHealth,
  onProcess,
  onCancel,
  onClearQueue,
  onDownloadAll,
  onModeChange,
  onSidecarUrlChange,
  onSidecarTokenChange,
  onConnectSidecar,
}: ProcessPanelProps) {
  const busy = state.phase === "loading-engine" || state.phase === "processing";
  const buttonLabel = total === 1
    ? "一键去水印"
    : completed > 0
      ? `处理剩余 ${remaining} 个`
      : `开始批量处理 ${total} 个`;
  const downloadLabel = remaining === 0
    ? "下载全部视频"
    : `下载已完成 ${completed} 个`;
  const progress = Math.round(state.progress * 100);
  const nativeUnavailable = mode === "native" && sidecarState !== "ready";

  return (
    <section id={WORKFLOW_SECTIONS.process.id} className="process-panel" aria-labelledby="process-heading">
      <div className="process-panel__status" aria-live="polite">
        <div className="process-panel__status-line">
          <p className="eyebrow">{WORKFLOW_LABELS.process}</p>
          <div>
            <strong>{state.message}</strong>
            <span>{progress}%</span>
          </div>
        </div>
        <div
          className="process-panel__meter"
          role="progressbar"
          aria-label="批量处理进度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
        {state.error && <p className="process-panel__error"><TriangleAlert size={15} />{state.error}</p>}
      </div>

      <ProcessingModeControl
        mode={mode}
        sidecarUrl={sidecarUrl}
        token={sidecarToken}
        connectionState={sidecarState}
        connectionMessage={sidecarMessage}
        health={sidecarHealth}
        disabled={busy}
        onModeChange={onModeChange}
        onSidecarUrlChange={onSidecarUrlChange}
        onTokenChange={onSidecarTokenChange}
        onConnect={onConnectSidecar}
      />

      <div className="process-panel__copy">
        <h2 id="process-heading">{total > 1 ? "批量去水印" : "一键去水印"}</h2>
        <p>视频会逐个处理以控制内存占用；每项使用各自的选区，全程不上传服务器。</p>
      </div>

      <div className="process-panel__actions">
        <button
          className="button button--ghost button--large"
          type="button"
          disabled={busy || downloadingAll}
          onClick={onClearQueue}
        >
          <Trash2 size={17} /> 清空队列
        </button>
        {busy ? (
          <button className="button button--danger" type="button" onClick={onCancel}>
            <CircleStop size={18} /> 取消处理
          </button>
        ) : (
          <>
          {total > 1 && completed > 0 && (
            <button
              className={`button button--large ${remaining === 0 ? "button--primary" : "button--ghost"}`}
              type="button"
              disabled={downloadingAll}
              onClick={onDownloadAll}
            >
              <Download size={18} /> {downloadingAll ? "正在打包…" : downloadLabel}
            </button>
          )}
          {remaining > 0 && (
            <button
              className="button button--primary button--large"
              type="button"
              disabled={nativeUnavailable}
              title={nativeUnavailable ? "请先连接本机 sidecar，或切换到浏览器模式" : undefined}
              onClick={onProcess}
            >
              <Sparkles size={19} /> {buttonLabel}
            </button>
          )}
          </>
        )}
      </div>
    </section>
  );
}
