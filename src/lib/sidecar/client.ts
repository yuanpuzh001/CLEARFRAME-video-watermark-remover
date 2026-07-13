import type { NormalizedRegion } from "../../types/video";

export interface SidecarConnection {
  baseUrl: string;
  token: string;
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

interface SidecarJob {
  id: string;
  phase: "uploading" | "queued" | "processing" | "verifying" | "success" | "error" | "cancelled";
  progress: number;
  message: string;
  error?: string;
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

function headers(connection: SidecarConnection): HeadersInit {
  return { Authorization: `Bearer ${connection.token}` };
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

export async function checkSidecar(
  connection: SidecarConnection,
  signal?: AbortSignal,
): Promise<SidecarHealth> {
  const response = await fetch(`${normalizedBaseUrl(connection.baseUrl)}/v1/health`, {
    headers: headers(connection),
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<SidecarHealth>;
}

export async function processVideoWithSidecar(
  file: File,
  region: NormalizedRegion,
  connection: SidecarConnection,
  onProgress: (progress: number, message: string) => void,
  signal: AbortSignal,
): Promise<Blob> {
  const baseUrl = normalizedBaseUrl(connection.baseUrl);
  onProgress(0.01, "正在传给本机 sidecar…");
  const createResponse = await fetch(`${baseUrl}/v1/jobs`, {
    method: "POST",
    headers: {
      ...headers(connection),
      "Content-Type": "video/mp4",
      "X-Clearframe-Filename": file.name.replace(/[^a-zA-Z0-9._-]/g, "_"),
      "X-Clearframe-Region": JSON.stringify(region),
    },
    body: file,
    signal,
  });
  if (!createResponse.ok) throw await responseError(createResponse);
  let job = await createResponse.json() as SidecarJob;

  const cancelRemote = () => {
    void fetch(`${baseUrl}/v1/jobs/${job.id}`, {
      method: "DELETE",
      headers: headers(connection),
      keepalive: true,
    }).catch(() => undefined);
  };
  signal.addEventListener("abort", cancelRemote, { once: true });

  try {
    while (job.phase !== "success") {
      if (job.phase === "error") throw new Error(job.error || job.message || "本地加速处理失败");
      if (job.phase === "cancelled") throw new DOMException("处理已取消", "AbortError");
      onProgress(job.progress, job.message);
      await waitForPoll(signal);
      const statusResponse = await fetch(`${baseUrl}/v1/jobs/${job.id}`, {
        headers: headers(connection),
        cache: "no-store",
        signal,
      });
      if (!statusResponse.ok) throw await responseError(statusResponse);
      job = await statusResponse.json() as SidecarJob;
    }

    onProgress(0.99, "正在读取本地加速结果…");
    const outputResponse = await fetch(`${baseUrl}/v1/jobs/${job.id}/output`, {
      headers: headers(connection),
      cache: "no-store",
      signal,
    });
    if (!outputResponse.ok) throw await responseError(outputResponse);
    onProgress(1, "本地加速处理完成");
    const output = await outputResponse.blob();
    void fetch(`${baseUrl}/v1/jobs/${job.id}`, {
      method: "DELETE",
      headers: headers(connection),
    }).catch(() => undefined);
    return output;
  } finally {
    signal.removeEventListener("abort", cancelRemote);
  }
}
