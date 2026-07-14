import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProcessingModeControl } from "../src/components/ProcessingModeControl";

afterEach(cleanup);

describe("ProcessingModeControl", () => {
  it("explains that native acceleration requires an explicitly started loopback sidecar", () => {
    const onConnect = vi.fn();
    render(
      <ProcessingModeControl
        mode="native"
        sidecarUrl="http://127.0.0.1:3210"
        pairingCode=""
        connectionState="idle"
        connectionMessage="等待连接"
        health={null}
        disabled={false}
        onModeChange={vi.fn()}
        onSidecarUrlChange={vi.fn()}
        onConnect={onConnect}
      />,
    );

    expect(screen.getByText(/pnpm sidecar/)).toBeInTheDocument();
    expect(screen.getByText(/网页不会直接调用 NVENC 或 VideoToolbox/)).toBeInTheDocument();
    expect(screen.queryByLabelText("随机配对令牌")).not.toBeInTheDocument();
    expect(screen.getByText("无需复制令牌")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /一键配对/ }));
    expect(onConnect).toHaveBeenCalledOnce();
  });

  it("shows only the verification code while the HttpOnly session is being approved", () => {
    render(
      <ProcessingModeControl
        mode="native"
        sidecarUrl="http://127.0.0.1:3210"
        pairingCode="482731"
        connectionState="checking"
        connectionMessage="请在系统弹窗核对并确认：482 731"
        health={null}
        disabled={false}
        onModeChange={vi.fn()}
        onSidecarUrlChange={vi.fn()}
        onConnect={vi.fn()}
      />,
    );

    expect(screen.getByText("482 731")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "等待确认" })).toBeDisabled();
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(screen.getByText(/认证令牌不会出现在页面、URL 或终端/)).toBeInTheDocument();
  });

  it("shows VEO offline, invalid and verified CLI states without pretending the browser can execute it", () => {
    const onSelect = vi.fn();
    const onUseDelogo = vi.fn();
    const props = {
      mode: "veo" as const,
      sidecarUrl: "http://127.0.0.1:3210",
      pairingCode: "",
      connectionMessage: "等待连接",
      health: null,
      disabled: false,
      onModeChange: vi.fn(),
      onSidecarUrlChange: vi.fn(),
      onConnect: vi.fn(),
      onSelectVeoCli: onSelect,
      onUseDelogo,
    };
    const { rerender } = render(
      <ProcessingModeControl {...props} connectionState="idle" />,
    );

    expect(screen.getByRole("button", { name: /需要启动本地服务/ })).toBeDisabled();
    expect(screen.getByText(/CLI 不随 CLEARFRAME 分发/)).toBeInTheDocument();
    expect(screen.getByText(/M4 约 1 fps/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /官方 v0.6.4-demo 发布页/ })).toHaveAttribute(
      "href",
      "https://github.com/allenk/VeoWatermarkRemover/releases/tag/v0.6.4-demo",
    );

    rerender(
      <ProcessingModeControl
        {...props}
        connectionState="ready"
        veoCliStatus={{
          releaseVersion: "v0.6.4-demo",
          releaseUrl: "release",
          selection: {
            path: "/Users/test/untrusted-cli",
            fileName: "untrusted-cli",
            sizeBytes: 128,
            sha256: "bad-sha",
            platform: "darwin",
            valid: false,
            error: "SHA-256 不匹配",
          },
        }}
      />,
    );
    expect(screen.getByText("SHA-256 不匹配")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /确认改用 delogo 模式/ }));
    expect(onUseDelogo).toHaveBeenCalledOnce();

    rerender(
      <ProcessingModeControl
        {...props}
        connectionState="ready"
        veoCliStatus={{
          releaseVersion: "v0.6.4-demo",
          releaseUrl: "release",
          selection: {
            path: "/Users/test/GeminiWatermarkTool-Video",
            fileName: "GeminiWatermarkTool-Video",
            sizeBytes: 128,
            sha256: "trusted-sha",
            platform: "darwin",
            version: "v0.6.4-demo",
            valid: true,
          },
        }}
      />,
    );
    expect(screen.getByText("严格哈希校验通过")).toBeInTheDocument();
    expect(screen.getByText("trusted-sha")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /选择本地 CLI/ }));
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
