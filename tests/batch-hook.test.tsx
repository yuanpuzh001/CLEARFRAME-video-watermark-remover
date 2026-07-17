import { StrictMode, type PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBatchVideoProcessor } from "../src/hooks/useBatchVideoProcessor";
import type { VideoQueueItem } from "../src/types/video";

const { processVideoMock, processVideoWithSidecarMock, setSidecarConcurrencyMock } = vi.hoisted(() => ({
  processVideoMock: vi.fn(async () => new Blob(["clean"])),
  processVideoWithSidecarMock: vi.fn(async () => new Blob(["native-clean"])),
  setSidecarConcurrencyMock: vi.fn(async (_connection: unknown, concurrency: number) => ({ concurrency, active: 0, queued: 0 })),
}));

vi.mock("../src/lib/ffmpeg/processor", () => ({
  processVideo: processVideoMock,
  terminateVideoEngine: vi.fn(),
}));

vi.mock("../src/lib/sidecar/client", () => ({
  processVideoWithSidecar: processVideoWithSidecarMock,
  processVideoWithVeoSidecar: vi.fn(),
  setSidecarConcurrency: setSidecarConcurrencyMock,
}));

const item: VideoQueueItem = {
  id: "one",
  asset: {
    file: new File(["video"], "one.mp4", { type: "video/mp4" }),
    url: "blob:one",
    width: 100,
    height: 100,
    duration: 1,
    size: 5,
  },
  region: { x: 0.8, y: 0.8, width: 0.1, height: 0.1 },
};

describe("useBatchVideoProcessor", () => {
  beforeEach(() => {
    processVideoMock.mockClear();
    processVideoWithSidecarMock.mockClear();
    setSidecarConcurrencyMock.mockClear();
  });

  it("keeps accepting state updates under React StrictMode", async () => {
    const wrapper = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>;
    const { result } = renderHook(() => useBatchVideoProcessor(), { wrapper });

    await act(async () => result.current.run([item]));

    await waitFor(() => expect(result.current.states.one?.phase).toBe("success"));
    expect(processVideoMock).toHaveBeenCalledOnce();
  });

  it("configures and uses the selected sidecar concurrency", async () => {
    const secondItem: VideoQueueItem = {
      ...item,
      id: "two",
      asset: {
        ...item.asset,
        file: new File(["video-2"], "two.mp4", { type: "video/mp4" }),
        url: "blob:two",
      },
    };
    const connection = { baseUrl: "http://127.0.0.1:3210" };
    const { result } = renderHook(() => useBatchVideoProcessor({
      mode: "native",
      sidecar: connection,
      concurrency: 2,
    }));

    await act(async () => result.current.run([item, secondItem]));

    await waitFor(() => expect(result.current.states.two?.phase).toBe("success"));
    expect(setSidecarConcurrencyMock).toHaveBeenCalledWith(connection, 2, expect.any(AbortSignal));
    expect(processVideoWithSidecarMock).toHaveBeenCalledTimes(2);
  });
});
