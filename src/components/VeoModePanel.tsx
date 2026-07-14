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
  disabled: boolean;
  onSelect: () => void;
  onUseDelogo: () => void;
}

export function VeoModePanel({
  sidecarState,
  status,
  selecting,
  selectionError,
  disabled,
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
        <span><FlaskConical size={15} /> EXPERIMENTAL / USER-SUPPLIED CLI</span>
        <a href={RELEASE_URL} target="_blank" rel="noreferrer">
          官方 v0.6.4-demo 发布页 <ExternalLink size={13} />
        </a>
      </div>

      <div className="veo-mode__warnings">
        <p><ShieldAlert size={15} /><span><strong>第三方边界</strong>CLI 不随 CLEARFRAME 分发。上游页面声明公开/MIT，但当前仓库未展示可审计实现源码或独立 LICENSE 文件；请按第三方闭源二进制谨慎处理，并且只处理你有权处理的视频。</span></p>
        <p><ShieldAlert size={15} /><span><strong>实测质量</strong>M4 约 1 fps；视频码率可能明显下降，局部可能出现模糊或色斑。CLEARFRAME 不会二次编码或填充文件来伪装码率恢复。</span></p>
      </div>

      <div className={`veo-cli ${selection?.valid ? "is-valid" : selection ? "is-invalid" : ""}`}>
        <div className="veo-cli__head">
          <div>
            <FileCheck2 size={17} />
            <span><strong>本机 CLI 状态</strong><small>{selection?.valid ? "严格哈希校验通过" : selection ? "校验未通过，禁止执行" : "尚未选择"}</small></span>
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

        {selection && (
          <dl className="veo-cli__details">
            <div><dt>文件</dt><dd>{selection.fileName}</dd></div>
            <div><dt>大小</dt><dd>{formatBytes(selection.sizeBytes)}</dd></div>
            <div><dt>版本</dt><dd>{selection.version ?? "未识别"}</dd></div>
            <div className="veo-cli__wide"><dt>路径</dt><dd>{selection.path}</dd></div>
            <div className="veo-cli__wide"><dt>SHA-256</dt><dd>{selection.sha256 || "未计算"}</dd></div>
          </dl>
        )}
        {(selection?.error || selectionError) && (
          <p className="veo-cli__error" role="alert">{selection?.error || selectionError}</p>
        )}
        {(offline || (selection && !selection.valid)) && (
          <button className="veo-cli__fallback" type="button" disabled={disabled} onClick={onUseDelogo}>
            <Undo2 size={13} /> 确认改用 delogo 模式
          </button>
        )}
      </div>
    </div>
  );
}
