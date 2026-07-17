import { Layers3 } from "lucide-react";
import type { ProcessingMode } from "../hooks/useBatchVideoProcessor";
import {
  QUEUE_CONCURRENCY_OPTIONS,
  type QueueConcurrency,
} from "../lib/video/concurrency";

interface ConcurrencyControlProps {
  value: QueueConcurrency;
  mode: ProcessingMode;
  disabled?: boolean;
  onChange: (value: QueueConcurrency) => void;
}

export function ConcurrencyControl({
  value,
  mode,
  disabled = false,
  onChange,
}: ConcurrencyControlProps) {
  const browserMode = mode === "browser";
  const selected = browserMode ? 1 : value;
  const locked = disabled || browserMode;

  return (
    <div
      className={`concurrency-control ${browserMode ? "is-browser" : ""}`}
      title={browserMode ? "浏览器模式为控制内存占用，固定单任务处理" : "设置同时处理的视频数量"}
    >
      <span className="concurrency-control__label"><Layers3 size={14} /> 并行任务</span>
      <div className="concurrency-control__options" role="radiogroup" aria-label="选择并行任务数">
        {QUEUE_CONCURRENCY_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-label={`并行 ${option} 个任务`}
            aria-checked={selected === option}
            disabled={locked}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
