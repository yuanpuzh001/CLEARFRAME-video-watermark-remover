// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createSidecarConfig } from "../sidecar/config";

describe("sidecar config", () => {
  it("always binds loopback and supports a five-percent bitrate tolerance", () => {
    const config = createSidecarConfig(
      ["--port=4321", "--bitrate-tolerance=0.05"],
      { CLEARFRAME_PAIRING_TOKEN: "test-pairing-token" },
    );
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(4321);
    expect(config.bitrateTolerance).toBe(0.05);
    expect(config.maxUploadBytes).toBe(500 * 1024 * 1024);
    expect(config.token).toBe("test-pairing-token");
  });

  it("rejects an invalid upload limit instead of disabling the limiter", () => {
    expect(() => createSidecarConfig([], { CLEARFRAME_MAX_UPLOAD_BYTES: "not-a-number" }))
      .toThrow("文件上限");
  });
});
