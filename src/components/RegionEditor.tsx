import { Crosshair, Move, RotateCcw } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { clampRegion, DEFAULT_REGION, regionToPixels } from "../lib/video/region";
import type { NormalizedRegion, VideoAsset } from "../types/video";

interface RegionEditorProps {
  asset: VideoAsset;
  region: NormalizedRegion;
  onChange: (region: NormalizedRegion) => void;
}

type Interaction = {
  mode: "move" | "resize";
  startX: number;
  startY: number;
  initial: NormalizedRegion;
};

export function RegionEditor({ asset, region, onChange }: RegionEditorProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const [editing, setEditing] = useState(false);
  const pixels = regionToPixels(region, asset.width, asset.height);
  const stageMaxWidth = `${(72 * asset.width) / asset.height}vh`;

  const updateFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;
    const bounds = stageRef.current?.getBoundingClientRect();
    if (!interaction || !bounds) return;
    const dx = (event.clientX - interaction.startX) / bounds.width;
    const dy = (event.clientY - interaction.startY) / bounds.height;
    onChange(clampRegion(interaction.mode === "move"
      ? { ...interaction.initial, x: interaction.initial.x + dx, y: interaction.initial.y + dy }
      : { ...interaction.initial, width: interaction.initial.width + dx, height: interaction.initial.height + dy }));
  };

  const beginInteraction = (event: PointerEvent<HTMLDivElement>, mode: Interaction["mode"]) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = { mode, startX: event.clientX, startY: event.clientY, initial: region };
  };

  const endInteraction = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    interactionRef.current = null;
  };

  const handleKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.altKey ? 0.001 : 0.005;
    const direction = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }[event.key];
    if (!direction) return;
    event.preventDefault();
    const [dx, dy] = direction;
    onChange(clampRegion(event.shiftKey
      ? { ...region, width: region.width + dx, height: region.height + dy }
      : { ...region, x: region.x + dx, y: region.y + dy }));
  };

  return (
    <section className="region-panel" aria-labelledby="region-heading">
      <div className="region-panel__head">
        <div>
          <p className="eyebrow">MASK / 02</p>
          <h2 id="region-heading">确认水印区域</h2>
        </div>
        <div className="region-panel__actions">
          <button className="button button--ghost" type="button" onClick={() => onChange(DEFAULT_REGION)}>
            <RotateCcw size={15} /> 恢复默认
          </button>
          <button
            className={`button ${editing ? "button--active" : "button--ghost"}`}
            type="button"
            aria-pressed={editing}
            onClick={() => setEditing((value) => !value)}
          >
            <Crosshair size={16} /> {editing ? "完成微调" : "微调区域"}
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        className={`region-stage ${editing ? "is-editing" : ""}`}
        style={{
          aspectRatio: `${asset.width} / ${asset.height}`,
          maxWidth: stageMaxWidth,
        }}
      >
        <video src={asset.url} controls={!editing} playsInline preload="metadata" />
        <div className="region-stage__shade" aria-hidden="true" />
        <div
          className="region-box"
          role="application"
          tabIndex={editing ? 0 : -1}
          aria-label="水印选区。方向键移动，按住 Shift 和方向键缩放。"
          style={{
            left: `${region.x * 100}%`,
            top: `${region.y * 100}%`,
            width: `${region.width * 100}%`,
            height: `${region.height * 100}%`,
          }}
          onKeyDown={handleKeyboard}
          onPointerDown={(event) => beginInteraction(event, "move")}
          onPointerMove={updateFromPointer}
          onPointerUp={endInteraction}
          onPointerCancel={endInteraction}
        >
          <span className="region-box__tag">REMOVE</span>
          <Move className="region-box__move" size={18} aria-hidden="true" />
          <div
            className="region-box__handle"
            aria-hidden="true"
            onPointerDown={(event) => beginInteraction(event, "resize")}
            onPointerMove={updateFromPointer}
            onPointerUp={endInteraction}
            onPointerCancel={endInteraction}
          />
        </div>
      </div>

      <div className="region-readout">
        <div><span>起点 X</span><strong>{pixels.x}px</strong></div>
        <div><span>起点 Y</span><strong>{pixels.y}px</strong></div>
        <div><span>宽度</span><strong>{pixels.width}px</strong></div>
        <div><span>高度</span><strong>{pixels.height}px</strong></div>
        <p>{editing ? "拖动选框调整位置，右下角控制点调整大小。" : "默认区域已按样例定位，可直接进入修复。"}</p>
      </div>
    </section>
  );
}
