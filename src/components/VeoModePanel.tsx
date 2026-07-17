import { ExternalLink, FileCheck2, FlaskConical, FolderOpen, ShieldAlert, Undo2 } from "lucide-react";
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
  onUseDelogo: () => void;
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
  onUseDelogo,
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
      <div className="veo-mode__masthead">
        <span><FlaskConical size={15} /> VEO CLI / EXPERIMENTAL</span>
        <a href={RELEASE_URL} target="_blank" rel="noreferrer">
          下载 v0.6.4-demo <ExternalLink size={13} />
        </a>
      </div>

      <p className="veo-mode__notice">
        <ShieldAlert size={14} />
        第三方 CLI · M4 实测约 1 fps · 可能降码率或产生局部模糊 · 仅处理已获授权的视频
      </p>

      <div className="veo-mode__controls">
        <label className={`veo-force ${forceAllFrames ? "is-active" : ""}`}>
          <input
            type="checkbox"
            checked={forceAllFrames}
            disabled={disabled}
            onChange={(event) => onForceAllFramesChange(event.target.checked)}
          />
          <span>
            <strong>遮挡帧处理</strong>
            <small>减少跳帧，可能影响前景</small>
          </span>
        </label>

        <div className={`veo-cli ${selection?.valid ? "is-valid" : selection ? "is-invalid" : ""}`}>
          <div className="veo-cli__head">
            <div>
              <FileCheck2 size={17} />
              <span><strong>本机 CLI</strong><small>{selection?.valid ? "哈希校验通过" : selection ? "校验失败" : "尚未选择"}</small></span>
            </div>
            <button
              className="button button--ghost"
              type="button"
              disabled={disabled || offline || selecting}
              onClick={onSelect}
            >
              <FolderOpen size={15} /> {buttonLabel}
            </button>
          </div>
          {(selection?.error || selectionError) && (
            <p className="veo-cli__error" role="alert">{selection?.error || selectionError}</p>
          )}
          {(offline || (selection && !selection.valid)) && (
            <button className="veo-cli__fallback" type="button" disabled={disabled} onClick={onUseDelogo}>
              <Undo2 size={13} /> 改用 delogo
            </button>
          )}
        </div>
      </div>

      {selection && (
        <details className="veo-cli__disclosure">
          <summary>查看 CLI 校验信息</summary>
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
