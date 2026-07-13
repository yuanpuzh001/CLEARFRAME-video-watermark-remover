import type { VideoAsset } from "../../types/video";

export const MAX_FILE_BYTES = 200 * 1024 * 1024;
export const MAX_DURATION_SECONDS = 5 * 60;

export class VideoValidationError extends Error {}

export function validateVideoFile(file: File): void {
  const isMp4 = file.type === "video/mp4" || file.name.toLowerCase().endsWith(".mp4");
  if (!isMp4) {
    throw new VideoValidationError("仅支持 MP4 格式，请重新选择文件。");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new VideoValidationError("文件超过 200MB，请选择更小的视频。");
  }
}

export function loadVideoAsset(file: File): Promise<VideoAsset> {
  validateVideoFile(file);
  const url = URL.createObjectURL(file);

  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        URL.revokeObjectURL(url);
        reject(new VideoValidationError("无法读取视频时长，文件可能已经损坏。"));
        return;
      }
      if (video.duration > MAX_DURATION_SECONDS) {
        URL.revokeObjectURL(url);
        reject(new VideoValidationError("视频超过 5 分钟，请选择更短的视频。"));
        return;
      }
      resolve({
        file,
        url,
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
        size: file.size,
      });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new VideoValidationError("无法解析这个 MP4，请确认文件可以正常播放。"));
    };
    video.src = url;
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function cleanOutputName(fileName: string): string {
  const base = fileName.replace(/\.mp4$/i, "");
  return `${base}-clean.mp4`;
}
