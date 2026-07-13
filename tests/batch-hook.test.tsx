import { StrictMode, type PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBatchVideoProcessor } from "../src/hooks/useBatchVideoProcessor";
import type { VideoQueueItem } from "../src/types/video";

const { processVideoMock } = vi.hoisted(() => ({
  processVideoMock: vi.fn(async () => new Blob(["clean"])),
}));

vi.mock("../src/lib/ffmpeg/processor", () => ({
  processVideo: processVideoMock,
  terminateVideoEngine: vi.fn(),
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
  beforeEach(() => processVideoMock.mockClear());

  it("keeps accepting state updates under React StrictMode", async () => {
    const wrapper = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>;
    const { result } = renderHook(() => useBatchVideoProcessor(), { wrapper });

    await act(async () => result.current.run([item]));

    await waitFor(() => expect(result.current.states.one?.phase).toBe("success"));
    expect(processVideoMock).toHaveBeenCalledOnce();
  });
});
