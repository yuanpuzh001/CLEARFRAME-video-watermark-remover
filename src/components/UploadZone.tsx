import { FileUp, Film, ShieldCheck } from "lucide-react";
import { useRef, useState, type ChangeEvent, type DragEvent } from "react";

interface UploadZoneProps {
  disabled?: boolean;
  onSelect: (files: File[]) => void;
}

export function UploadZone({ disabled = false, onSelect }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pickFiles = (files: FileList | null) => {
    const selected = files ? Array.from(files) : [];
    if (selected.length > 0) onSelect(selected);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (!disabled) pickFiles(event.dataTransfer.files);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    pickFiles(event.target.files);
    event.target.value = "";
  };

  return (
    <div
      className={`upload-zone ${dragging ? "is-dragging" : ""}`}
      onDragEnter={() => setDragging(true)}
      onDragLeave={() => setDragging(false)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="upload-zone__scanline" aria-hidden="true" />
      <div className="upload-zone__icon" aria-hidden="true">
        <FileUp size={28} strokeWidth={1.6} />
      </div>
      <p className="eyebrow">LOCAL INPUT / 01</p>
      <h2>把视频交给浏览器，<br />不必交给服务器。</h2>
      <p className="upload-zone__copy">拖放 MP4 到这里，或从电脑中选择。文件只停留在当前设备，并按队列顺序处理。</p>
      <button
        className="button button--primary"
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <Film size={18} />
        选择 MP4 视频
      </button>
      <p className="upload-zone__hint">可以选择多个文件</p>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="video/mp4,.mp4"
        multiple
        onChange={handleChange}
      />
      <div className="upload-zone__limits">
        <span>单文件 ≤ 200MB</span>
        <span>时长 ≤ 5 分钟</span>
        <span>顺序处理队列</span>
        <span><ShieldCheck size={14} /> 本机处理</span>
      </div>
    </div>
  );
}
