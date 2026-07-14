import { afterEach, describe, expect, it, vi } from "vitest";
import { checkSidecar, getVeoCliStatus, pairSidecar, processVideoWithSidecar, processVideoWithVeoSidecar, selectVeoCli } from "../src/lib/sidecar/client";

afterEach(() => vi.unstubAllGlobals());

describe("sidecar browser client", () => {
  it("rejects non-loopback service addresses before sending credentials", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(checkSidecar({ baseUrl: "https://example.com" }))
      .rejects.toThrow("127.0.0.1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("pairs through an origin-bound cookie without exposing a token to JavaScript", async () => {
    const pending = { id: "pair-1", code: "482731", expiresAt: Date.now() + 60_000, status: "pending" };
    const approved = { ...pending, status: "approved" };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(pending), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(approved), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const onChallenge = vi.fn();

    await expect(pairSidecar({ baseUrl: "http://127.0.0.1:3210" }, onChallenge)).resolves.toMatchObject({ status: "approved" });
    expect(onChallenge).toHaveBeenCalledWith(expect.objectContaining({ code: "482731" }));
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("Bearer");
  });

  it("submits, polls and downloads a completed local job", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "job-1", phase: "queued", progress: 0.01, message: "等待" }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "job-1", phase: "success", progress: 1, message: "完成" }), { status: 200 }))
      .mockResolvedValueOnce(new Response("video", { status: 200, headers: { "Content-Type": "video/mp4" } }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const progress = vi.fn();
    const result = await processVideoWithSidecar(
      new File(["input"], "sample.mp4", { type: "video/mp4" }),
      { x: 0.8, y: 0.8, width: 0.1, height: 0.1 },
      { baseUrl: "http://127.0.0.1:3210" },
      progress,
      new AbortController().signal,
    );

    expect(result).toBeInstanceOf(Blob);
    expect(result.size).toBe(5);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:3210/v1/jobs");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "include" });
    expect(progress).toHaveBeenLastCalledWith(1, "本地加速处理完成");
  });

  it("selects the VEO CLI without sending a browser path", async () => {
    const status = { releaseVersion: "v0.6.4-demo", releaseUrl: "release" };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(status), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(status), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const connection = { baseUrl: "http://127.0.0.1:3210" };

    await getVeoCliStatus(connection);
    await selectVeoCli(connection);
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:3210/v1/veo/cli");
    expect(fetchMock.mock.calls[1][0]).toBe("http://127.0.0.1:3210/v1/veo/cli/select");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "POST" });
    expect(fetchMock.mock.calls[1][1]).not.toHaveProperty("body");
  });

  it("returns VEO media integrity separately from bitrate tolerance", async () => {
    const completed = {
      id: "veo-job",
      outputName: "sample-veo-clean.mp4",
      phase: "success",
      progress: 1,
      message: "完成",
      result: {
        cliVersion: "v0.6.4-demo",
        cliSha256: "trusted",
        cliElapsedMs: 139000,
        mediaIntegrityPassed: true,
        bitrateWithinTolerance: false,
        mediaIntegrity: { supported: true, passed: true, videoBitstreamEqual: true, audioBitstreamEqual: true },
        verification: { bitrateDelta: -0.2786, sourceVideoBitrate: 8000000, actualVideoBitrate: 5771200 },
      },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...completed, phase: "queued", result: undefined }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(completed), { status: 200 }))
      .mockResolvedValueOnce(new Response("video", { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await processVideoWithVeoSidecar(
      new File(["input"], "sample.mp4", { type: "video/mp4" }),
      { baseUrl: "http://127.0.0.1:3210" },
      vi.fn(),
      new AbortController().signal,
    );
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:3210/v1/veo/jobs");
    expect(result.outputName).toBe("sample-veo-clean.mp4");
    expect(result.details.mediaIntegrityPassed).toBe(true);
    expect(result.details.bitrateWithinTolerance).toBe(false);
  });
});
