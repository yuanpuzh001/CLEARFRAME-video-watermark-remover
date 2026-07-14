// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { copyFile } from "node:fs/promises";
import { createSidecarServer } from "../sidecar/server";
import type { NativeCapabilities } from "../sidecar/capabilities";
import type { SidecarConfig } from "../sidecar/config";
import type { NativeJobResult } from "../sidecar/native-job";
import type { VeoJobResult } from "../sidecar/veo-job";

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

  it("establishes an origin-bound HttpOnly session after native approval", async () => {
    const app = await createSidecarServer({
      config,
      capabilities,
      pairingApprover: async ({ code, origin }) => {
        expect(code).toMatch(/^\d{6}$/);
        expect(origin).toBe("http://127.0.0.1:5173");
        return true;
      },
    });
    close = app.close;
    await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    const address = app.server.address() as AddressInfo;
    const root = `http://127.0.0.1:${address.port}`;
    const origin = "http://127.0.0.1:5173";
    const created = await fetch(`${root}/v1/pairing/requests`, {
      method: "POST",
      headers: { Origin: origin },
    });
    expect(created.status).toBe(202);
    const challenge = await created.json() as { id: string; code: string };
    expect(challenge.code).toMatch(/^\d{6}$/);

    let cookie = "";
    let status = "pending";
    for (let attempt = 0; attempt < 10 && status === "pending"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2));
      const response = await fetch(`${root}/v1/pairing/requests/${challenge.id}`, { headers: { Origin: origin } });
      status = ((await response.json()) as { status: string }).status;
      cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
    }
    expect(status).toBe("approved");
    expect(cookie).toMatch(/^clearframe_sidecar_session=/);

    const health = await fetch(`${root}/v1/health`, {
      headers: { Origin: origin, Cookie: cookie },
    });
    expect(health.status).toBe(200);
    expect(health.headers.get("access-control-allow-credentials")).toBe("true");
    expect(await health.text()).not.toContain(config.token);
  });

  it("keeps protected APIs locked when native pairing is rejected", async () => {
    const app = await createSidecarServer({ config, capabilities, pairingApprover: async () => false });
    close = app.close;
    await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    const address = app.server.address() as AddressInfo;
    const root = `http://127.0.0.1:${address.port}`;
    const origin = "http://127.0.0.1:5173";
    const created = await fetch(`${root}/v1/pairing/requests`, { method: "POST", headers: { Origin: origin } });
    const challenge = await created.json() as { id: string };
    await new Promise((resolve) => setTimeout(resolve, 2));
    const status = await fetch(`${root}/v1/pairing/requests/${challenge.id}`, { headers: { Origin: origin } });

    expect(((await status.json()) as { status: string }).status).toBe("denied");
    expect(status.headers.get("set-cookie")).toBeNull();
    expect((await fetch(`${root}/v1/health`, { headers: { Origin: origin } })).status).toBe(401);
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

  it("rejects Origin:null even when the pairing token is present", async () => {
    const app = await createSidecarServer({ config, capabilities });
    close = app.close;
    await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    const address = app.server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/health`, {
      headers: { Authorization: "Bearer test-sidecar-token", Origin: "null" },
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

  it("selects VEO only through the injected native picker and runs a validated snapshot", async () => {
    const selectedCli = {
      path: "/test/fake-veo",
      fileName: "fake-veo",
      sizeBytes: 32,
      sha256: "fake-trusted-sha",
      platform: "darwin" as const,
      version: "v0.6.4-demo-test",
      valid: true,
    };
    let selected = 0;
    const app = await createSidecarServer({
      config,
      capabilities,
      veoCliSelector: async () => {
        selected += 1;
        return selectedCli;
      },
      veoJobRunner: async ({ inputPath, outputPath, cli }) => {
        expect(cli).toEqual(selectedCli);
        await copyFile(inputPath, outputPath);
        return {
          cliVersion: cli.version,
          cliSha256: cli.sha256,
          cliElapsedMs: 1,
          finalizationElapsedMs: 1,
          elapsedMs: 2,
          mediaIntegrity: { supported: true, passed: true, videoBitstreamEqual: true, audioBitstreamEqual: true },
          mediaIntegrityPassed: true,
          bitrateWithinTolerance: false,
          verification: { valid: true, bitrateWithinTolerance: false },
        } as unknown as VeoJobResult;
      },
    });
    close = app.close;
    await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    const address = app.server.address() as AddressInfo;
    const root = `http://127.0.0.1:${address.port}`;
    const headers = { Authorization: "Bearer test-sidecar-token", Origin: "http://127.0.0.1:5173" };

    const before = await fetch(`${root}/v1/veo/cli`, { headers });
    expect(((await before.json()) as { selection?: unknown }).selection).toBeUndefined();
    expect((await fetch(`${root}/v1/veo/jobs`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "video/mp4", "X-Clearframe-Filename": "sample.mp4" },
      body: Buffer.from("video"),
    })).status).toBe(409);
    expect((await fetch(`${root}/v1/veo/cli/select`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/attacker-controlled" }),
    })).status).toBe(400);

    const selectionResponse = await fetch(`${root}/v1/veo/cli/select`, { method: "POST", headers });
    expect(selectionResponse.status).toBe(200);
    expect(((await selectionResponse.json()) as { selection: { sha256: string } }).selection.sha256).toBe("fake-trusted-sha");
    expect(selected).toBe(1);

    const created = await fetch(`${root}/v1/veo/jobs`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "video/mp4", "X-Clearframe-Filename": "sample.mp4" },
      body: Buffer.from("video"),
    });
    expect(created.status).toBe(202);
    const createdJob = await created.json() as { id: string };
    let statusBody: { phase: string; result?: { mediaIntegrityPassed: boolean; bitrateWithinTolerance: boolean } } = { phase: "queued" };
    for (let attempt = 0; attempt < 10 && statusBody.phase !== "success"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      statusBody = await (await fetch(`${root}/v1/jobs/${createdJob.id}`, { headers })).json() as typeof statusBody;
    }
    expect(statusBody.phase).toBe("success");
    expect(statusBody.result).toMatchObject({ mediaIntegrityPassed: true, bitrateWithinTolerance: false });
  });
});
