import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProcessingModeControl } from "../src/components/ProcessingModeControl";

describe("ProcessingModeControl", () => {
  it("explains that native acceleration requires an explicitly started loopback sidecar", () => {
    const onConnect = vi.fn();
    render(
      <ProcessingModeControl
        mode="native"
        sidecarUrl="http://127.0.0.1:3210"
        token="pairing-token"
        connectionState="idle"
        connectionMessage="等待连接"
        health={null}
        disabled={false}
        onModeChange={vi.fn()}
        onSidecarUrlChange={vi.fn()}
        onTokenChange={vi.fn()}
        onConnect={onConnect}
      />,
    );

    expect(screen.getByText(/pnpm sidecar/)).toBeInTheDocument();
    expect(screen.getByText(/网页不会直接调用 NVENC 或 VideoToolbox/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /连接本机/ }));
    expect(onConnect).toHaveBeenCalledOnce();
  });
});
