import { ExternalLink, FileCheck2, FlaskConical, FolderOpen } from "lucide-react";
import type { VeoCliStatus } from "../lib/sidecar/client";
import { formatBytes } from "../lib/video/validation";
import type { SidecarConnectionState } from "./ProcessingModeControl";

const RELEASE_URL = "https://github.com/allenk/VeoWatermarkRemover/releases/tag/v0.6.4-demo";

interface VeoModePanelProps {
  sidecarState: SidecarConnectionState;
  status: VeoCliStatus | null;
  selecting: boolean;
  selectionError: string;
  forceAllFrames: boolean;
  disabled: boolean;
  onForceAllFramesChange: (value: boolean) => void;
  onSelect: () => void;
}

export function VeoModePanel({
  sidecarState,
  status,
  selecting,
  selectionError,
  forceAllFrames,
  disabled,
  onForceAllFramesChange,
  onSelect,
}: VeoModePanelProps) {
  const selection = status?.selection;
  const offline = sidecarState !== "ready";
  const buttonLabel = offline
    ? "需要启动本地服务"
    : selecting
      ? "正在打开本机选择器…"
      : "选择本地 CLI";

  return (
    <div className="veo-mode" aria-label="VEO 实验模式设置">
      <div className="veo-mode__toolbar">
        <div className="veo-mode__identity">
          <FlaskConical size={16} />
          <span>
            <strong>VEO CLI</strong>
            <small>第三方实验 · M4 ≈ 1 fps · 可能降码率或局部模糊</small>
          </span>
        </div>

        <label className={`veo-force ${forceAllFrames ? "is-active" : ""}`}>
          <input
            type="checkbox"
            checked={forceAllFrames}
            disabled={disabled}
            onChange={(event) => onForceAllFramesChange(event.target.checked)}
          />
          <span>
            <strong>遮挡帧处理</strong>
          </span>
        </label>

        <div className={`veo-cli ${selection?.valid ? "is-valid" : selection ? "is-invalid" : ""}`}>
          <FileCheck2 size={16} />
          <div>
            <strong>{selection?.fileName ?? "本机 CLI"}</strong>
            <small>{selection?.valid ? "哈希校验通过" : selection ? "校验失败" : "尚未选择"}</small>
          </div>
        </div>

        <button
          className="button button--ghost veo-mode__select"
          type="button"
          disabled={disabled || offline || selecting}
          onClick={onSelect}
        >
          <FolderOpen size={15} /> {buttonLabel}
        </button>

        <a
          className="veo-mode__release"
          href={RELEASE_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="下载 VEO CLI v0.6.4-demo"
        >
          v0.6.4 <ExternalLink size={12} />
        </a>
      </div>

      {(selection?.error || selectionError) && (
        <p className="veo-cli__error" role="alert">{selection?.error || selectionError}</p>
      )}

      {selection && (
        <details className="veo-cli__disclosure">
          <summary>CLI 校验信息 · 仅处理已获授权的视频</summary>
          <dl className="veo-cli__details">
            <div><dt>文件</dt><dd>{selection.fileName}</dd></div>
            <div><dt>大小</dt><dd>{formatBytes(selection.sizeBytes)}</dd></div>
            <div><dt>版本</dt><dd>{selection.version ?? "未识别"}</dd></div>
            <div className="veo-cli__wide"><dt>本机位置</dt><dd>仅 sidecar 可见，不发送给网页</dd></div>
            <div className="veo-cli__wide"><dt>SHA-256</dt><dd>{selection.sha256 || "未计算"}</dd></div>
          </dl>
        </details>
      )}
    </div>
  );
}
