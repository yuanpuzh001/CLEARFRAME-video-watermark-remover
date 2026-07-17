import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProcessingModeControl } from "../src/components/ProcessingModeControl";

afterEach(cleanup);

describe("ProcessingModeControl", () => {
  it("summarizes each mode advantage without adding extra card content", () => {
    render(
      <ProcessingModeControl
        mode="browser"
        sidecarUrl="http://127.0.0.1:3210"
        pairingCode=""
        connectionState="idle"
        connectionMessage="等待连接"
        health={null}
        disabled={false}
        onModeChange={vi.fn()}
        onSidecarUrlChange={vi.fn()}
        onConnect={vi.fn()}
      />,
    );

    expect(screen.getByRole("radio", { name: /浏览器模式 点击即用 · 无需安装/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /本地加速模式 速度最快 · 本机硬件编码/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /VEO 专属去水印 效果最好 · 需下载第三方 CLI/ })).toBeInTheDocument();
  });

  it("uses only READY and NOT READY for all three mode states", () => {
    const baseProps = {
      mode: "browser" as const,
      sidecarUrl: "http://127.0.0.1:3210",
      pairingCode: "",
      connectionMessage: "等待连接",
      health: null,
      disabled: false,
      onModeChange: vi.fn(),
      onSidecarUrlChange: vi.fn(),
      onConnect: vi.fn(),
    };
    const { rerender } = render(
      <ProcessingModeControl {...baseProps} connectionState="idle" />,
    );
    const browserCard = screen.getByRole("radio", { name: /浏览器模式/ });
    const nativeCard = screen.getByRole("radio", { name: /本地加速模式/ });
    const veoCard = screen.getByRole("radio", { name: /VEO 专属去水印/ });

    expect(within(browserCard).getByText("READY")).toBeInTheDocument();
    expect(within(nativeCard).getByText("NOT READY")).toBeInTheDocument();
    expect(within(veoCard).getByText("NOT READY")).toBeInTheDocument();

    rerender(<ProcessingModeControl {...baseProps} connectionState="ready" />);
    expect(within(nativeCard).getByText("READY")).toBeInTheDocument();
    expect(within(veoCard).getByText("NOT READY")).toBeInTheDocument();

    rerender(
      <ProcessingModeControl
        {...baseProps}
        connectionState="ready"
        veoCliStatus={{
          releaseVersion: "v0.6.4-demo",
          releaseUrl: "release",
          selection: {
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
    expect(within(veoCard).getByText("READY")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/FALLBACK|OPTIONAL|EXPERIMENT|VERIFIED/);
  });

  it("offers one-click sidecar pairing without the obsolete terminal instructions", () => {
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

    expect(screen.queryByText(/pnpm sidecar/)).not.toBeInTheDocument();
    expect(screen.queryByText(/网页不会直接调用 NVENC 或 VideoToolbox/)).not.toBeInTheDocument();
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
    expect(screen.queryByText(/认证令牌不会出现在页面、URL 或终端/)).not.toBeInTheDocument();
  });

  it("shows VEO offline, invalid and verified CLI states without pretending the browser can execute it", () => {
    const onSelect = vi.fn();
    const onForceAllFramesChange = vi.fn();
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
      veoForceAllFrames: true,
      onVeoForceAllFramesChange: onForceAllFramesChange,
    };
    const { rerender } = render(
      <ProcessingModeControl {...props} connectionState="idle" />,
    );

    expect(screen.getByRole("button", { name: /需要启动本地服务/ })).toBeDisabled();
    expect(screen.getByText(/第三方实验 · M4 ≈ 1 fps/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /下载 VEO CLI v0.6.4-demo/ })).toHaveAttribute(
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
    expect(screen.queryByRole("button", { name: /改用 delogo/ })).not.toBeInTheDocument();

    rerender(
      <ProcessingModeControl
        {...props}
        connectionState="ready"
        veoCliStatus={{
          releaseVersion: "v0.6.4-demo",
          releaseUrl: "release",
          selection: {
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
    expect(screen.getByText("哈希校验通过")).toBeInTheDocument();
    const forceToggle = screen.getByRole("checkbox", { name: /遮挡帧处理/ });
    expect(forceToggle).toBeChecked();
    fireEvent.click(forceToggle);
    expect(onForceAllFramesChange).toHaveBeenCalledWith(false);
    expect(screen.getByText("仅 sidecar 可见，不发送给网页")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("/Users/test/");
    expect(screen.getByText("trusted-sha")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /选择本地 CLI/ }));
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
