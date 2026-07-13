import { CircleStop, Download, Sparkles, TriangleAlert } from "lucide-react";
import type { ProcessingState } from "../types/video";

interface ProcessPanelProps {
  state: ProcessingState;
  total: number;
  completed: number;
  remaining: number;
  downloadingAll: boolean;
  onProcess: () => void;
  onCancel: () => void;
  onDownloadAll: () => void;
}

export function ProcessPanel({
  state,
  total,
  completed,
  remaining,
  downloadingAll,
  onProcess,
  onCancel,
  onDownloadAll,
}: ProcessPanelProps) {
  const busy = state.phase === "loading-engine" || state.phase === "processing";
  const buttonLabel = total === 1
    ? "一键去水印"
    : completed > 0
      ? `处理剩余 ${remaining} 个`
      : `开始批量处理 ${total} 个`;

  return (
    <section className="process-panel" aria-labelledby="process-heading">
      <div className="process-panel__copy">
        <p className="eyebrow">RESTORE / 03</p>
        <h2 id="process-heading">{total > 1 ? "批量去水印" : "一键去水印"}</h2>
        <p>视频会逐个处理以控制内存占用；每项使用各自的选区，全程不上传服务器。</p>
      </div>

      <div className="process-panel__status" aria-live="polite">
        <div className="process-panel__meter">
          <span style={{ width: `${Math.round(state.progress * 100)}%` }} />
        </div>
        <div>
          <strong>{state.message}</strong>
          <span>{Math.round(state.progress * 100)}%</span>
        </div>
        {state.error && <p className="process-panel__error"><TriangleAlert size={15} />{state.error}</p>}
      </div>

      {busy ? (
        <button className="button button--danger" type="button" onClick={onCancel}>
          <CircleStop size={18} /> 取消处理
        </button>
      ) : (
        <div className="process-panel__actions">
          {total > 1 && completed > 0 && (
            <button
              className={`button button--large ${remaining === 0 ? "button--primary" : "button--ghost"}`}
              type="button"
              disabled={downloadingAll}
              onClick={onDownloadAll}
            >
              <Download size={18} /> {downloadingAll ? "正在打包…" : "全部下载"}
            </button>
          )}
          {remaining > 0 && (
            <button className="button button--primary button--large" type="button" onClick={onProcess}>
              <Sparkles size={19} /> {buttonLabel}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
