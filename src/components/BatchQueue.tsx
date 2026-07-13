import { FilePlus2, Film, Trash2 } from "lucide-react";
import { useRef, type ChangeEvent } from "react";
import { WORKFLOW_LABELS, WORKFLOW_SECTIONS } from "../lib/ui/workflowLabels";
import { formatBytes, formatDuration } from "../lib/video/validation";
import type { BatchItemProcessingState, VideoQueueItem } from "../types/video";

interface BatchQueueProps {
  items: VideoQueueItem[];
  states: Record<string, BatchItemProcessingState>;
  activeId: string | null;
  disabled?: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  onSelect: (id: string) => void;
}

export function BatchQueue({
  items,
  states,
  activeId,
  disabled = false,
  onAdd,
  onRemove,
  onSelect,
}: BatchQueueProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    if (files.length > 0) onAdd(files);
    event.target.value = "";
  };

  return (
    <section id={WORKFLOW_SECTIONS.inputQueue.id} className="batch-queue" aria-labelledby="batch-heading">
      <div className="batch-queue__head">
        <div>
          <p className="eyebrow">{WORKFLOW_LABELS.inputQueue}</p>
          <h2 id="batch-heading">处理队列</h2>
        </div>
        <button
          className="button button--ghost"
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <FilePlus2 size={16} /> 添加视频
        </button>
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept="video/mp4,.mp4"
          multiple
          onChange={handleChange}
        />
      </div>

      <div className="batch-queue__list" role="list" aria-label="待处理视频">
        {items.map((item, index) => {
          const active = item.id === activeId;
          const state = states[item.id];
          const stateLabel = (() => {
            switch (state?.phase) {
              case "queued": return "QUEUED";
              case "loading-engine": return "STARTING";
              case "processing": return `${Math.round(state.progress * 100)}%`;
              case "success": return "DONE";
              case "error": return "FAILED";
              case "cancelled": return "STOPPED";
              default: return active ? "EDITING" : "READY";
            }
          })();
          return (
            <article
              className={`batch-item ${active ? "is-active" : ""} batch-item--${state?.phase ?? "idle"}`}
              role="listitem"
              key={item.id}
            >
            <button
              className="batch-item__select"
              type="button"
              aria-label={`编辑 ${item.asset.file.name}`}
              aria-pressed={active}
              onClick={() => onSelect(item.id)}
            >
                <span className="batch-item__index">{String(index + 1).padStart(2, "0")}</span>
                <Film size={17} aria-hidden="true" />
                <span className="batch-item__copy">
                  <strong>{item.asset.file.name}</strong>
                  <small>
                    {item.asset.width}×{item.asset.height} · {formatDuration(item.asset.duration)} · {formatBytes(item.asset.size)}
                  </small>
                </span>
                <span className="batch-item__state">{stateLabel}</span>
              </button>
              <button
                className="batch-item__remove"
                type="button"
                aria-label={`移除 ${item.asset.file.name}`}
                disabled={disabled}
                onClick={() => onRemove(item.id)}
              >
                <Trash2 size={14} />
              </button>
              {(state?.phase === "processing" || state?.phase === "loading-engine") && (
                <span className="batch-item__progress" style={{ width: `${Math.round(state.progress * 100)}%` }} />
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
