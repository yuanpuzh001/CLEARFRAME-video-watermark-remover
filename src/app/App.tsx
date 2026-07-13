import { useEffect, useState } from "react";
import { Activity, LockKeyhole, Sparkles } from "lucide-react";
import { UploadZone } from "../components/UploadZone";
import { VideoPreview } from "../components/VideoPreview";
import { ProcessPanel } from "../components/ProcessPanel";
import { ResultPanel } from "../components/ResultPanel";
import { useVideoProcessor } from "../hooks/useVideoProcessor";
import { DEFAULT_REGION } from "../lib/video/region";
import { loadVideoAsset } from "../lib/video/validation";
import type { NormalizedRegion, VideoAsset } from "../types/video";

export function App() {
  const [asset, setAsset] = useState<VideoAsset | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [region, setRegion] = useState<NormalizedRegion>(DEFAULT_REGION);
  const processor = useVideoProcessor();

  useEffect(() => () => {
    if (asset) URL.revokeObjectURL(asset.url);
  }, [asset]);

  const handleSelect = async (file: File) => {
    setError("");
    setLoading(true);
    try {
      const nextAsset = await loadVideoAsset(file);
      setRegion(DEFAULT_REGION);
      processor.clearResult();
      setAsset((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return nextAsset;
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "视频读取失败，请重试。");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setError("");
    processor.cancel();
    processor.clearResult();
    setAsset((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  };

  const handleRegionChange = (nextRegion: NormalizedRegion) => {
    setRegion(nextRegion);
    if (processor.result) processor.clearResult();
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Clearframe 首页">
          <span className="brand__mark"><Sparkles size={17} /></span>
          <span>CLEARFRAME</span>
          <small>去印台</small>
        </a>
        <div className="topbar__status">
          <span><Activity size={14} /> ENGINE READY</span>
          <span><LockKeyhole size={14} /> LOCAL ONLY</span>
        </div>
      </header>

      <main id="top">
        <section className="intro">
          <div>
            <p className="eyebrow">VIDEO RESTORATION CONSOLE</p>
            <h1>擦去角落的标记，<br /><em>留下完整的画面。</em></h1>
          </div>
          <div className="intro__meta">
            <span>01 上传</span><span>02 定位</span><span>03 修复</span><span>04 导出</span>
          </div>
        </section>

        {error && <div className="notice notice--error" role="alert">{error}</div>}
        {loading && <div className="notice" role="status">正在读取视频信息…</div>}

        {asset ? (
          <div className="workspace-stack">
            <VideoPreview
              asset={asset}
              region={region}
              onReset={handleReset}
              onRegionChange={handleRegionChange}
            />
            <ProcessPanel
              state={processor.state}
              onProcess={() => void processor.run(asset, region)}
              onCancel={processor.cancel}
            />
            {processor.result && (
              <ResultPanel
                asset={asset}
                result={processor.result}
                onReprocess={() => {
                  processor.clearResult();
                  document.getElementById("region-heading")?.scrollIntoView({ behavior: "smooth" });
                }}
              />
            )}
          </div>
        ) : (
          <UploadZone disabled={loading} onSelect={handleSelect} />
        )}
      </main>

      <footer>
        <span>所有帧均在本机浏览器内处理</span>
        <span>仅处理你拥有权利或已获授权的视频</span>
      </footer>
    </div>
  );
}
