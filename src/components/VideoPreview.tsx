import { FileVideo2 } from "lucide-react";
import { WORKFLOW_SECTIONS } from "../lib/ui/workflowLabels";
import type { NormalizedRegion, VideoAsset } from "../types/video";
import { formatBytes, formatDuration } from "../lib/video/validation";
import { RegionEditor } from "./RegionEditor";

interface VideoPreviewProps {
  asset: VideoAsset;
  region: NormalizedRegion;
  onRegionChange: (region: NormalizedRegion) => void;
}

export function VideoPreview({ asset, region, onRegionChange }: VideoPreviewProps) {
  return (
    <section id={WORKFLOW_SECTIONS.watermarkSelection.id} className="workspace-card" aria-labelledby="region-heading">
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
