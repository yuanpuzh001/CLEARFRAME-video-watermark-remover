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

export interface VeoProcessingDetails {
  cliVersion: string;
  cliSha256: string;
  cliElapsedMs: number;
  mediaIntegrityPassed: boolean;
  bitrateWithinTolerance: boolean;
  bitrateDelta: number;
  sourceVideoBitrate: number;
  actualVideoBitrate: number;
  mediaIntegrity: {
    supported: boolean;
    passed: boolean;
    reason?: string;
    videoBitstreamEqual: boolean;
    audioBitstreamEqual: boolean;
    processedVideoSha256?: string;
    finalVideoSha256?: string;
    sourceAudioSha256?: string;
    finalAudioSha256?: string;
  };
}

export interface ProcessedVideoResult {
  blob: Blob;
  mode: "browser" | "native" | "veo";
  outputName: string;
  veo?: VeoProcessingDetails;
}

export interface BatchItemProcessingState {
  phase: BatchProcessingPhase;
  progress: number;
  message: string;
  error?: string;
  result: ProcessedVideoResult | null;
}
