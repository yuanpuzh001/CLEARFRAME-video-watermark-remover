import { FileVideo2, RotateCcw } from "lucide-react";
import type { NormalizedRegion, VideoAsset } from "../types/video";
import { formatBytes, formatDuration } from "../lib/video/validation";
import { RegionEditor } from "./RegionEditor";

interface VideoPreviewProps {
  asset: VideoAsset;
  region: NormalizedRegion;
  onReset: () => void;
  onRegionChange: (region: NormalizedRegion) => void;
}

export function VideoPreview({ asset, region, onReset, onRegionChange }: VideoPreviewProps) {
  return (
    <section className="workspace-card" aria-labelledby="source-heading">
      <div className="workspace-card__head">
        <div>
          <p className="eyebrow">SOURCE / 01</p>
          <h2 id="source-heading">原片预览</h2>
        </div>
        <button className="button button--ghost" type="button" onClick={onReset}>
          <RotateCcw size={16} />
          更换视频
        </button>
      </div>
      <RegionEditor asset={asset} region={region} onChange={onRegionChange} />
      <div className="asset-strip">
        <FileVideo2 size={19} />
        <div className="asset-strip__name">
          <strong>{asset.file.name}</strong>
          <span>MP4 / 本地文件</span>
        </div>
        <dl>
          <div><dt>画幅</dt><dd>{asset.width} × {asset.height}</dd></div>
          <div><dt>时长</dt><dd>{formatDuration(asset.duration)}</dd></div>
          <div><dt>大小</dt><dd>{formatBytes(asset.size)}</dd></div>
        </dl>
      </div>
    </section>
  );
}
