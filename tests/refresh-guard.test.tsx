import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  guardRefresh,
  REFRESH_WARNING_MESSAGE,
  useRefreshGuard,
} from "../src/hooks/useRefreshGuard";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useRefreshGuard", () => {
  it("uses the requested loss warning when a refresh is attempted", () => {
    const event = {
      preventDefault: vi.fn(),
      returnValue: "",
    } as unknown as BeforeUnloadEvent;

    guardRefresh(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.returnValue).toBe(REFRESH_WARNING_MESSAGE);
  });

  it("registers the browser refresh guard only while uploaded assets exist", () => {
    const addEventListener = vi.spyOn(window, "addEventListener");
    const removeEventListener = vi.spyOn(window, "removeEventListener");
    const { rerender, unmount } = renderHook(
      ({ enabled }) => useRefreshGuard(enabled),
      { initialProps: { enabled: false } },
    );

    expect(addEventListener).not.toHaveBeenCalledWith("beforeunload", guardRefresh);

    rerender({ enabled: true });
    expect(addEventListener).toHaveBeenCalledWith("beforeunload", guardRefresh);

    unmount();
    expect(removeEventListener).toHaveBeenCalledWith("beforeunload", guardRefresh);
  });
});
