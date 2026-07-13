// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { copyFile } from "node:fs/promises";
import { createSidecarServer } from "../sidecar/server";
import type { NativeCapabilities } from "../sidecar/capabilities";
import type { SidecarConfig } from "../sidecar/config";
import type { NativeJobResult } from "../sidecar/native-job";

const config: SidecarConfig = {
  host: "127.0.0.1",
  port: 3210,
  token: "test-sidecar-token",
  ffmpegPath: "ffmpeg",
  ffprobePath: "ffprobe",
  bitrateTolerance: 0.1,
  allowedOrigins: ["http://127.0.0.1:5173"],
  maxUploadBytes: 1024,
};

const capabilities: NativeCapabilities = {
  platform: "darwin",
  arch: "arm64",
  ffmpegVersion: "ffmpeg version test",
  ffprobeVersion: "ffprobe version test",
  encoders: [{ name: "libx264", family: "h264", kind: "software", available: true }],
  selected: { h264: "libx264" },
};

describe("sidecar HTTP security", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => { if (close) await close(); close = undefined; });

  it("requires the pairing token and returns runtime-probed capabilities", async () => {
    const app = await createSidecarServer({ config, capabilities });
    close = app.close;
    await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    const address = app.server.address() as AddressInfo;
    const url = `http://127.0.0.1:${address.port}/v1/health`;

    expect((await fetch(url)).status).toBe(401);
    const response = await fetch(url, {
      headers: { Authorization: "Bearer test-sidecar-token", Origin: "http://127.0.0.1:5173" },
    });
    expect(response.status).toBe(200);
    const body = await response.json() as { ready: boolean; host: string; capabilities: NativeCapabilities };
    expect(body.ready).toBe(true);
    expect(body.host).toBe("127.0.0.1");
    expect(body.capabilities.selected.h264).toBe("libx264");
  });

  it("rejects unapproved browser origins", async () => {
    const app = await createSidecarServer({ config, capabilities });
    close = app.close;
    await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    const address = app.server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/health`, {
      headers: { Authorization: "Bearer test-sidecar-token", Origin: "https://malicious.example" },
    });
    expect(response.status).toBe(403);
  });

  it("accepts a local raw upload, serves the result and cleans it explicitly", async () => {
    const app = await createSidecarServer({
      config,
      capabilities,
      jobRunner: async ({ inputPath, outputPath }) => {
        await copyFile(inputPath, outputPath);
        return {
          plan: { encoder: "libx264", hardware: false },
          encoderFallback: false,
          bitrateAttempts: 1,
          elapsedMs: 1,
          realtimeFactor: 1,
          verification: { valid: true },
        } as unknown as NativeJobResult;
      },
    });
    close = app.close;
    await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    const address = app.server.address() as AddressInfo;
    const root = `http://127.0.0.1:${address.port}`;
    const headers = {
      Authorization: "Bearer test-sidecar-token",
      Origin: "http://127.0.0.1:5173",
    };
    const created = await fetch(`${root}/v1/jobs`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "video/mp4",
        "X-Clearframe-Filename": "sample.mp4",
        "X-Clearframe-Region": JSON.stringify({ x: 0.8, y: 0.8, width: 0.1, height: 0.1 }),
      },
      body: Buffer.from("video"),
    });
    expect(created.status).toBe(202);
    const createdJob = await created.json() as { id: string };
    let phase = "queued";
    for (let attempt = 0; attempt < 10 && phase !== "success"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const status = await fetch(`${root}/v1/jobs/${createdJob.id}`, { headers });
      phase = ((await status.json()) as { phase: string }).phase;
    }
    expect(phase).toBe("success");
    const output = await fetch(`${root}/v1/jobs/${createdJob.id}/output`, { headers });
    expect(await output.text()).toBe("video");
    expect((await fetch(`${root}/v1/jobs/${createdJob.id}`, { method: "DELETE", headers })).status).toBe(202);
    expect((await fetch(`${root}/v1/jobs/${createdJob.id}`, { headers })).status).toBe(404);
  });
});
