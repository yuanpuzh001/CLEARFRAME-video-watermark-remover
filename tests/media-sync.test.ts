import { describe, expect, it, vi } from "vitest";
import { syncMediaPause, syncMediaPlay, syncMediaRate, syncMediaTime, type SyncableMedia } from "../src/lib/video/mediaSync";

function createMedia(overrides: Partial<SyncableMedia> = {}): SyncableMedia {
  return {
    currentTime: 0,
    playbackRate: 1,
    paused: true,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    ...overrides,
  };
}

describe("comparison media synchronization", () => {
  it("aligns time and starts the peer player", () => {
    const source = createMedia({ currentTime: 2.5, playbackRate: 1.25, paused: false });
    const target = createMedia();

    syncMediaPlay(source, target);

    expect(target.currentTime).toBe(2.5);
    expect(target.playbackRate).toBe(1.25);
    expect(target.play).toHaveBeenCalledOnce();
  });

  it("avoids tiny seek feedback and mirrors pause and rate changes", () => {
    const source = createMedia({ currentTime: 3, playbackRate: 0.75 });
    const target = createMedia({ currentTime: 2.96, paused: false });

    syncMediaTime(source, target);
    expect(target.currentTime).toBe(2.96);

    syncMediaRate(source, target);
    syncMediaPause(target);
    expect(target.playbackRate).toBe(0.75);
    expect(target.pause).toHaveBeenCalledOnce();
  });
});
