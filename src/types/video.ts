export interface VideoAsset {
  file: File;
  url: string;
  width: number;
  height: number;
  duration: number;
  size: number;
}

export interface NormalizedRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VideoQueueItem {
  id: string;
  asset: VideoAsset;
  region: NormalizedRegion;
}

export type ProcessingPhase =
  | "idle"
  | "loading-engine"
  | "processing"
  | "success"
  | "error"
  | "cancelled";

export interface ProcessingState {
  phase: ProcessingPhase;
  progress: number;
  message: string;
  error?: string;
}

export type BatchProcessingPhase = ProcessingPhase | "queued";

export interface BatchItemProcessingState {
  phase: BatchProcessingPhase;
  progress: number;
  message: string;
  error?: string;
  result: Blob | null;
}
