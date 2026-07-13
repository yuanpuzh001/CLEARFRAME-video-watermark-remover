import { Check, Download, RefreshCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cleanOutputName, formatBytes } from "../lib/video/validation";
import type { VideoAsset } from "../types/video";

interface ResultPanelProps {
  asset: VideoAsset;
  result: Blob;
  onReprocess: () => void;
}

export function ResultPanel({ asset, result, onReprocess }: ResultPanelProps) {
  const [resultUrl] = useState(() => URL.createObjectURL(result));
  const sectionRef = useRef<HTMLElement>(null);
  const outputName = cleanOutputName(asset.file.name);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => {
      cancelAnimationFrame(frame);
      URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  return (
    <section ref={sectionRef} className="result-panel" aria-labelledby="result-heading">
      <div className="result-panel__head">
        <div>
          <p className="eyebrow">OUTPUT / 04</p>
          <h2 id="result-heading"><Check size={22} /> 修复结果已就绪</h2>
          <p>分别播放原片与结果，检查水印区域的纹理修复效果。</p>
        </div>
        <div className="result-panel__actions">
          <button className="button button--ghost" type="button" onClick={onReprocess}>
            <RefreshCcw size={16} /> 重新调整
          </button>
          <a className="button button--primary button--large" href={resultUrl} download={outputName}>
            <Download size={18} /> 下载视频
          </a>
        </div>
      </div>

      <div className="compare-grid">
        <figure>
          <div className="compare-grid__label"><span>BEFORE</span> 原片</div>
          <video src={asset.url} controls playsInline preload="metadata" />
        </figure>
        <figure>
          <div className="compare-grid__label compare-grid__label--after"><span>AFTER</span> 已修复</div>
          <video src={resultUrl} controls playsInline preload="metadata" />
        </figure>
      </div>

      <div className="result-file">
        <span className="result-file__signal" aria-hidden="true" />
        <div><strong>{outputName}</strong><span>H.264 · MP4 · 本地生成</span></div>
        <div><span>输出大小</span><strong>{formatBytes(result.size)}</strong></div>
        <div><span>隐私状态</span><strong>未上传</strong></div>
      </div>
    </section>
  );
}
