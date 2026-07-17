import { Cpu, FlaskConical, Gauge, LoaderCircle, PlugZap, ShieldCheck } from "lucide-react";
import type { ProcessingMode } from "../hooks/useBatchVideoProcessor";
import type { SidecarHealth, VeoCliStatus } from "../lib/sidecar/client";
import { VeoModePanel } from "./VeoModePanel";

export type SidecarConnectionState = "idle" | "checking" | "ready" | "error";

interface ProcessingModeControlProps {
  mode: ProcessingMode;
  sidecarUrl: string;
  pairingCode: string;
  connectionState: SidecarConnectionState;
  connectionMessage: string;
  health: SidecarHealth | null;
  disabled: boolean;
  onModeChange: (mode: ProcessingMode) => void;
  onSidecarUrlChange: (value: string) => void;
  onConnect: () => void;
  veoCliStatus?: VeoCliStatus | null;
  veoSelecting?: boolean;
  veoSelectionError?: string;
  veoForceAllFrames?: boolean;
  onVeoForceAllFramesChange?: (value: boolean) => void;
  onSelectVeoCli?: () => void;
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
  pairingCode,
  connectionState,
  connectionMessage,
  health,
  disabled,
  onModeChange,
  onSidecarUrlChange,
  onConnect,
  veoCliStatus = null,
  veoSelecting = false,
  veoSelectionError = "",
  veoForceAllFrames = false,
  onVeoForceAllFramesChange = () => undefined,
  onSelectVeoCli = () => undefined,
}: ProcessingModeControlProps) {
  const nativeReady = connectionState === "ready";
  const veoReady = nativeReady && veoCliStatus?.selection?.valid === true;

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
          <span><strong>浏览器模式</strong><small><b>点击即用</b> · 无需安装</small></span>
          <i className="is-ready">READY</i>
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
          <span><strong>本地加速模式</strong><small><b>速度最快</b> · 本机硬件编码</small></span>
          <i className={nativeReady ? "is-ready" : "is-not-ready"}>{nativeReady ? "READY" : "NOT READY"}</i>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === "veo"}
          className={`mode-card mode-card--veo ${mode === "veo" ? "is-active" : ""}`}
          disabled={disabled}
          onClick={() => onModeChange("veo")}
        >
          <FlaskConical size={18} />
          <span><strong>VEO 专属去水印</strong><small><b>效果最好</b> · 需下载第三方 CLI</small></span>
          <i className={veoReady ? "is-ready" : "is-not-ready"}>{veoReady ? "READY" : "NOT READY"}</i>
        </button>
      </div>

      {(mode === "native" || mode === "veo") && (
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
            <div className="mode-control__pairing" aria-label="安全配对状态">
              <span>安全配对</span>
              <div>
                <ShieldCheck size={16} />
                <strong>{connectionState === "ready"
                  ? "已配对 · 令牌已隐藏"
                  : pairingCode
                    ? `${pairingCode.slice(0, 3)} ${pairingCode.slice(3)}`
                    : "无需复制令牌"}</strong>
                <small>{connectionState === "checking" ? "等待本机确认" : "HTTPONLY SESSION"}</small>
              </div>
            </div>
            <button
              className="button button--ghost mode-control__connect"
              type="button"
              disabled={disabled || connectionState === "checking"}
              onClick={onConnect}
            >
              {connectionState === "checking" ? <LoaderCircle className="is-spinning" size={16} /> : <PlugZap size={16} />}
              {connectionState === "checking" ? "等待确认" : connectionState === "ready" ? "检查连接" : "一键配对"}
            </button>
          </div>
          <p className={`mode-control__state mode-control__state--${connectionState}`} role="status">
            <span>{nativeSummary(health)}</span>
            {connectionMessage}
          </p>
        </div>
      )}

      {mode === "veo" && (
        <VeoModePanel
          sidecarState={connectionState}
          status={veoCliStatus}
          selecting={veoSelecting}
          selectionError={veoSelectionError}
          forceAllFrames={veoForceAllFrames}
          disabled={disabled}
          onForceAllFramesChange={onVeoForceAllFramesChange}
          onSelect={onSelectVeoCli}
        />
      )}
    </div>
  );
}
