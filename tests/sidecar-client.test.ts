import { afterEach, describe, expect, it, vi } from "vitest";
import { checkSidecar, processVideoWithSidecar } from "../src/lib/sidecar/client";

afterEach(() => vi.unstubAllGlobals());

describe("sidecar browser client", () => {
  it("rejects non-loopback service addresses before sending a token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(checkSidecar({ baseUrl: "https://example.com", token: "secret" }))
      .rejects.toThrow("127.0.0.1");
    expect(fetchMock).not.toHaveBeenCalled();
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
      { baseUrl: "http://127.0.0.1:3210", token: "secret" },
      progress,
      new AbortController().signal,
    );

    expect(result).toBeInstanceOf(Blob);
    expect(result.size).toBe(5);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:3210/v1/jobs");
    expect(progress).toHaveBeenLastCalledWith(1, "本地加速处理完成");
  });
});
