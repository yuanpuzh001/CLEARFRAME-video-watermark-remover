import type { NormalizedRegion } from "../../types/video";
import type { VeoProcessingDetails } from "../../types/video";

export interface SidecarConnection {
  baseUrl: string;
}

export interface SidecarPairingChallenge {
  id: string;
  code: string;
  expiresAt: number;
  status: "pending" | "approved" | "denied" | "expired";
}

export interface SidecarHealth {
  ready: boolean;
  mode: "native-sidecar";
  bitrateTolerance: number;
  capabilities: {
    platform: string;
    arch: string;
    gpuName?: string;
    selected: Partial<Record<"h264" | "hevc", string>>;
  };
}

export interface VeoCliSelectionStatus {
  fileName: string;
  sizeBytes: number;
  sha256: string;
  platform: string;
  version?: string;
  valid: boolean;
  error?: string;
}

export interface VeoCliStatus {
  releaseVersion: string;
  releaseUrl: string;
  cancelled?: boolean;
  selection?: VeoCliSelectionStatus;
}

interface SidecarJob {
  id: string;
  outputName?: string;
  phase: "uploading" | "queued" | "processing" | "verifying" | "success" | "error" | "cancelled";
  progress: number;
  message: string;
  error?: string;
  result?: {
    cliVersion?: string;
    cliSha256?: string;
    cliElapsedMs?: number;
    cliFramesPerSecond?: number;
    mediaIntegrityPassed?: boolean;
    bitrateWithinTolerance?: boolean;
    mediaIntegrity?: VeoProcessingDetails["mediaIntegrity"];
    verification?: {
      bitrateDelta?: number;
      sourceVideoBitrate?: number;
      actualVideoBitrate?: number;
    };
  };
}

const POLL_INTERVAL_MS = 400;

function normalizedBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" || url.username || url.password
    || (url.hostname !== "127.0.0.1" && url.hostname !== "localhost")) {
    throw new Error("本地加速地址必须是 127.0.0.1 或 localhost 的 HTTP 地址");
  }
  return url.origin;
}

async function responseError(response: Response): Promise<Error> {
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  return new Error(payload?.error || `本地加速服务请求失败（HTTP ${response.status}）`);
}

async function waitForPoll(signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("处理已取消", "AbortError"));
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, POLL_INTERVAL_MS);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function requestJson<T>(
  connection: SidecarConnection,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${normalizedBaseUrl(connection.baseUrl)}${path}`, {
    ...init,
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<T>;
}

export async function checkSidecar(
  connection: SidecarConnection,
  signal?: AbortSignal,
): Promise<SidecarHealth> {
  const response = await fetch(`${normalizedBaseUrl(connection.baseUrl)}/v1/health`, {
    credentials: "include",
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<SidecarHealth>;
}

export async function pairSidecar(
  connection: SidecarConnection,
  onChallenge: (challenge: SidecarPairingChallenge) => void,
  signal?: AbortSignal,
): Promise<SidecarPairingChallenge> {
  const created = await requestJson<SidecarPairingChallenge>(connection, "/v1/pairing/requests", {
    method: "POST",
    signal,
  });
  onChallenge(created);
  let challenge = created;
  const pollingSignal = signal ?? new AbortController().signal;
  while (challenge.status === "pending") {
    await waitForPoll(pollingSignal);
    challenge = await requestJson<SidecarPairingChallenge>(connection, `/v1/pairing/requests/${created.id}`, {
      signal,
    });
    onChallenge(challenge);
  }
  if (challenge.status === "approved") return challenge;
  if (challenge.status === "expired") throw new Error("安全配对请求已过期，请重新尝试");
  throw new Error("已在本机拒绝安全配对");
}

export function getVeoCliStatus(connection: SidecarConnection, signal?: AbortSignal): Promise<VeoCliStatus> {
  return requestJson(connection, "/v1/veo/cli", { signal });
}

export function selectVeoCli(connection: SidecarConnection, signal?: AbortSignal): Promise<VeoCliStatus> {
  return requestJson(connection, "/v1/veo/cli/select", { method: "POST", signal });
}

async function processRemoteJob(
  file: File,
  connection: SidecarConnection,
  options: {
    endpoint: "/v1/jobs" | "/v1/veo/jobs";
    region?: NormalizedRegion;
    veoForceAllFrames?: boolean;
    uploadingMessage: string;
    completedMessage: string;
  },
  onProgress: (progress: number, message: string) => void,
  signal: AbortSignal,
): Promise<{ blob: Blob; job: SidecarJob }> {
  const baseUrl = normalizedBaseUrl(connection.baseUrl);
  onProgress(0.01, options.uploadingMessage);
  const requestHeaders: Record<string, string> = {
    "Content-Type": "video/mp4",
    "X-Clearframe-Filename": file.name.replace(/[^a-zA-Z0-9._-]/g, "_"),
  };
  if (options.region) requestHeaders["X-Clearframe-Region"] = JSON.stringify(options.region);
  if (options.endpoint === "/v1/veo/jobs") {
    requestHeaders["X-Clearframe-Veo-Force"] = options.veoForceAllFrames ? "1" : "0";
  }
  const createResponse = await fetch(`${baseUrl}${options.endpoint}`, {
    method: "POST",
    headers: requestHeaders,
    credentials: "include",
    body: file,
    signal,
  });
  if (!createResponse.ok) throw await responseError(createResponse);
  let job = await createResponse.json() as SidecarJob;

  const cancelRemote = () => {
    void fetch(`${baseUrl}/v1/jobs/${job.id}`, {
      method: "DELETE",
      credentials: "include",
      keepalive: true,
    }).catch(() => undefined);
  };
  signal.addEventListener("abort", cancelRemote, { once: true });
  try {
    while (job.phase !== "success") {
      if (job.phase === "error") throw new Error(job.error || job.message || "本地处理失败");
      if (job.phase === "cancelled") throw new DOMException("处理已取消", "AbortError");
      onProgress(job.progress, job.message);
      await waitForPoll(signal);
      const statusResponse = await fetch(`${baseUrl}/v1/jobs/${job.id}`, {
        credentials: "include",
        cache: "no-store",
        signal,
      });
      if (!statusResponse.ok) throw await responseError(statusResponse);
      job = await statusResponse.json() as SidecarJob;
    }
    onProgress(0.99, "正在读取本机处理结果…");
    const outputResponse = await fetch(`${baseUrl}/v1/jobs/${job.id}/output`, {
      credentials: "include",
      cache: "no-store",
      signal,
    });
    if (!outputResponse.ok) throw await responseError(outputResponse);
    const blob = await outputResponse.blob();
    onProgress(1, options.completedMessage);
    void fetch(`${baseUrl}/v1/jobs/${job.id}`, {
      method: "DELETE",
      credentials: "include",
    }).catch(() => undefined);
    return { blob, job };
  } finally {
    signal.removeEventListener("abort", cancelRemote);
  }
}

export async function processVideoWithSidecar(
  file: File,
  region: NormalizedRegion,
  connection: SidecarConnection,
  onProgress: (progress: number, message: string) => void,
  signal: AbortSignal,
): Promise<Blob> {
  return (await processRemoteJob(file, connection, {
    endpoint: "/v1/jobs",
    region,
    uploadingMessage: "正在传给本机 sidecar…",
    completedMessage: "本地加速处理完成",
  }, onProgress, signal)).blob;
}

export async function processVideoWithVeoSidecar(
  file: File,
  connection: SidecarConnection,
  onProgress: (progress: number, message: string) => void,
  signal: AbortSignal,
  options: { forceAllFrames?: boolean } = {},
): Promise<{ blob: Blob; outputName: string; details: VeoProcessingDetails }> {
  const { blob, job } = await processRemoteJob(file, connection, {
    endpoint: "/v1/veo/jobs",
    uploadingMessage: "正在把视频交给本机 VEO 实验服务…",
    completedMessage: "VEO 实验处理完成",
    veoForceAllFrames: options.forceAllFrames,
  }, onProgress, signal);
  const result = job.result;
  if (!result?.cliVersion || !result.cliSha256 || !result.mediaIntegrity
    || result.mediaIntegrityPassed === undefined || result.bitrateWithinTolerance === undefined) {
    throw new Error("VEO 任务缺少媒体完整性验收结果");
  }
  return {
    blob,
    outputName: job.outputName || file.name.replace(/\.mp4$/i, "-veo-clean.mp4"),
    details: {
      cliVersion: result.cliVersion,
      cliSha256: result.cliSha256,
      cliElapsedMs: result.cliElapsedMs ?? 0,
      cliFramesPerSecond: result.cliFramesPerSecond,
      mediaIntegrityPassed: result.mediaIntegrityPassed,
      bitrateWithinTolerance: result.bitrateWithinTolerance,
      bitrateDelta: result.verification?.bitrateDelta ?? 0,
      sourceVideoBitrate: result.verification?.sourceVideoBitrate ?? 0,
      actualVideoBitrate: result.verification?.actualVideoBitrate ?? 0,
      mediaIntegrity: result.mediaIntegrity,
    },
  };
}
