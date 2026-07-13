import { CircleStop, Sparkles, TriangleAlert } from "lucide-react";
import type { ProcessingState } from "../types/video";

interface ProcessPanelProps {
  state: ProcessingState;
  onProcess: () => void;
  onCancel: () => void;
}

export function ProcessPanel({ state, onProcess, onCancel }: ProcessPanelProps) {
  const busy = state.phase === "loading-engine" || state.phase === "processing";

  return (
    <section className="process-panel" aria-labelledby="process-heading">
      <div className="process-panel__copy">
        <p className="eyebrow">RESTORE / 03</p>
        <h2 id="process-heading">一键去水印</h2>
        <p>内容插值会依据选区四周的像素逐帧重建画面，全程不上传服务器。</p>
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
        <button className="button button--primary button--large" type="button" onClick={onProcess}>
          <Sparkles size={19} /> 一键去水印
        </button>
      )}
    </section>
  );
}
