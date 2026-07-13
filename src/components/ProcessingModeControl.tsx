import { Cpu, Gauge, LoaderCircle, PlugZap } from "lucide-react";
import type { ProcessingMode } from "../hooks/useBatchVideoProcessor";
import type { SidecarHealth } from "../lib/sidecar/client";

export type SidecarConnectionState = "idle" | "checking" | "ready" | "error";

interface ProcessingModeControlProps {
  mode: ProcessingMode;
  sidecarUrl: string;
  token: string;
  connectionState: SidecarConnectionState;
  connectionMessage: string;
  health: SidecarHealth | null;
  disabled: boolean;
  onModeChange: (mode: ProcessingMode) => void;
  onSidecarUrlChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  onConnect: () => void;
}

function nativeSummary(health: SidecarHealth | null): string {
  if (!health) return "等待连接";
  const encoder = health.capabilities.selected.h264 ?? health.capabilities.selected.hevc ?? "软件编码";
  const hardware = /videotoolbox|nvenc/i.test(encoder) ? "硬件编码可用" : "软件编码回退";
  return `${hardware} · ${encoder}`;
}

export function ProcessingModeControl({
  mode,
  sidecarUrl,
  token,
  connectionState,
  connectionMessage,
  health,
  disabled,
  onModeChange,
  onSidecarUrlChange,
  onTokenChange,
  onConnect,
}: ProcessingModeControlProps) {
  return (
    <div className="mode-control" aria-label="处理模式">
      <div className="mode-control__options" role="radiogroup" aria-label="选择视频处理模式">
        <button
          type="button"
          role="radio"
          aria-checked={mode === "browser"}
          className={`mode-card ${mode === "browser" ? "is-active" : ""}`}
          disabled={disabled}
          onClick={() => onModeChange("browser")}
        >
          <Cpu size={18} />
          <span><strong>浏览器模式</strong><small>无需安装 · ffmpeg.wasm</small></span>
          <i>FALLBACK</i>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === "native"}
          className={`mode-card ${mode === "native" ? "is-active" : ""}`}
          disabled={disabled}
          onClick={() => onModeChange("native")}
        >
          <Gauge size={18} />
          <span><strong>本地加速模式</strong><small>需主动启动 localhost sidecar</small></span>
          <i>{connectionState === "ready" ? "READY" : "OPTIONAL"}</i>
        </button>
      </div>

      {mode === "native" && (
        <div className="mode-control__connection">
          <div className="mode-control__fields">
            <label>
              <span>SIDECAR 地址</span>
              <input
                type="url"
                value={sidecarUrl}
                disabled={disabled || connectionState === "checking"}
                onChange={(event) => onSidecarUrlChange(event.target.value)}
                spellCheck={false}
              />
            </label>
            <label>
              <span>随机配对令牌</span>
              <input
                type="password"
                value={token}
                disabled={disabled || connectionState === "checking"}
                onChange={(event) => onTokenChange(event.target.value)}
                placeholder="粘贴 sidecar 启动时显示的令牌"
                autoComplete="off"
              />
            </label>
            <button
              className="button button--ghost mode-control__connect"
              type="button"
              disabled={disabled || connectionState === "checking" || token.trim().length === 0}
              onClick={onConnect}
            >
              {connectionState === "checking" ? <LoaderCircle className="is-spinning" size={16} /> : <PlugZap size={16} />}
              {connectionState === "checking" ? "探测中" : "连接本机"}
            </button>
          </div>
          <p className={`mode-control__state mode-control__state--${connectionState}`} role="status">
            <span>{nativeSummary(health)}</span>
            {connectionMessage}
          </p>
          <p className="mode-control__hint">
            先在本项目终端运行 <code>pnpm sidecar</code>，再粘贴令牌。网页不会直接调用 NVENC 或 VideoToolbox，视频仅通过 127.0.0.1 传给本机进程。
          </p>
        </div>
      )}
    </div>
  );
}
