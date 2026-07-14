import { Check, CircleAlert, CircleCheck, Download, RefreshCcw } from "lucide-react";
import { useEffect, useRef, useState, type RefObject, type SyntheticEvent } from "react";
import { WORKFLOW_LABELS } from "../lib/ui/workflowLabels";
import { syncMediaPause, syncMediaPlay, syncMediaRate, syncMediaTime } from "../lib/video/mediaSync";
import { cleanOutputName, formatBytes } from "../lib/video/validation";
import type { ProcessedVideoResult, VideoAsset } from "../types/video";

interface ResultPanelProps {
  asset: VideoAsset;
  result: ProcessedVideoResult;
  autoScroll?: boolean;
  onReprocess: () => void;
}

export function ResultPanel({ asset, result, autoScroll = true, onReprocess }: ResultPanelProps) {
  const [resultUrl, setResultUrl] = useState("");
  const sectionRef = useRef<HTMLElement>(null);
  const beforeVideoRef = useRef<HTMLVideoElement>(null);
  const afterVideoRef = useRef<HTMLVideoElement>(null);
  const outputName = result.outputName || cleanOutputName(asset.file.name);

  const withPeer = (
    event: SyntheticEvent<HTMLVideoElement>,
    peerRef: RefObject<HTMLVideoElement | null>,
    sync: (source: HTMLVideoElement, target: HTMLVideoElement) => void,
  ) => {
    const peer = peerRef.current;
    if (peer) sync(event.currentTarget, peer);
  };

  useEffect(() => {
    const nextResultUrl = URL.createObjectURL(result.blob);
    setResultUrl(nextResultUrl);
    const frame = autoScroll
      ? requestAnimationFrame(() => {
          sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        })
      : null;
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      URL.revokeObjectURL(nextResultUrl);
    };
  }, [result]);

  return (
    <section ref={sectionRef} className="result-panel" aria-labelledby="result-heading">
      <div className="result-panel__head">
        <div>
          <p className="eyebrow">{WORKFLOW_LABELS.outputVideo}</p>
          <h2 id="result-heading"><Check size={22} /> 修复结果</h2>
          <p>播放或拖动任一画面，两侧会同步到同一时间点，便于检查修复效果。</p>
        </div>
        <div className="result-panel__actions">
          <button className="button button--ghost" type="button" onClick={onReprocess}>
            <RefreshCcw size={16} /> 重新调整
          </button>
          <a
            className="button button--primary button--large"
            href={resultUrl || undefined}
            download={outputName}
            aria-disabled={!resultUrl}
          >
            <Download size={18} /> 下载视频
          </a>
        </div>
      </div>

      {result.veo && (
        <div className="veo-verification" aria-label="VEO 媒体验收结果">
          <div className={result.veo.mediaIntegrityPassed ? "is-pass" : "is-fail"}>
            {result.veo.mediaIntegrityPassed ? <CircleCheck size={17} /> : <CircleAlert size={17} />}
            <span><small>媒体完整性</small><strong>{result.veo.mediaIntegrityPassed ? "通过" : "未通过"}</strong></span>
            <p>处理视频轨 → 最终视频轨：{result.veo.mediaIntegrity.videoBitstreamEqual ? "SHA 相同" : "SHA 不同"}<br />原片音频轨 → 最终音频轨：{result.veo.mediaIntegrity.audioBitstreamEqual ? "SHA 相同" : "SHA 不同"}</p>
          </div>
          <div className={result.veo.bitrateWithinTolerance ? "is-pass" : "is-warn"}>
            {result.veo.bitrateWithinTolerance ? <CircleCheck size={17} /> : <CircleAlert size={17} />}
            <span><small>视频码率容差</small><strong>{result.veo.bitrateWithinTolerance ? "通过" : "超出"} · {(result.veo.bitrateDelta * 100).toFixed(2)}%</strong></span>
            <p>这是独立质量指标；超出容差不会通过二次编码或填充文件伪装恢复。</p>
          </div>
          <div className="veo-verification__runtime">
            <small>VEO CLI</small>
            <strong>{result.veo.cliVersion} · {(result.veo.cliElapsedMs / 1000).toFixed(1)}s</strong>
            <code title={result.veo.cliSha256}>{result.veo.cliSha256.slice(0, 16)}…</code>
          </div>
        </div>
      )}

      <div className="compare-grid">
        <figure>
          <div className="compare-grid__label"><span>BEFORE</span> 原片</div>
          <video
            ref={beforeVideoRef}
            src={asset.url}
            controls
            playsInline
            preload="metadata"
            onPlay={(event) => withPeer(event, afterVideoRef, syncMediaPlay)}
            onPause={(event) => withPeer(event, afterVideoRef, (_, peer) => syncMediaPause(peer))}
            onSeeking={(event) => withPeer(event, afterVideoRef, syncMediaTime)}
            onTimeUpdate={(event) => withPeer(event, afterVideoRef, syncMediaTime)}
            onRateChange={(event) => withPeer(event, afterVideoRef, syncMediaRate)}
          />
        </figure>
        <figure>
          <div className="compare-grid__label compare-grid__label--after"><span>AFTER</span> 已修复</div>
          <video
            ref={afterVideoRef}
            src={resultUrl || undefined}
            controls
            playsInline
            preload="metadata"
            onPlay={(event) => withPeer(event, beforeVideoRef, syncMediaPlay)}
            onPause={(event) => withPeer(event, beforeVideoRef, (_, peer) => syncMediaPause(peer))}
            onSeeking={(event) => withPeer(event, beforeVideoRef, syncMediaTime)}
            onTimeUpdate={(event) => withPeer(event, beforeVideoRef, syncMediaTime)}
            onRateChange={(event) => withPeer(event, beforeVideoRef, syncMediaRate)}
          />
        </figure>
      </div>

      <div className="result-file">
        <span className="result-file__signal" aria-hidden="true" />
        <div><strong>{outputName}</strong><span>H.264 · MP4 · 本地生成</span></div>
        <div><span>输出大小</span><strong>{formatBytes(result.blob.size)}</strong></div>
        <div><span>隐私状态</span><strong>未上传</strong></div>
      </div>
    </section>
  );
}
