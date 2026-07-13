import { describe, expect, it } from "vitest";
import { buildDelogoCommand } from "../src/lib/ffmpeg/commands";

describe("FFmpeg command", () => {
  it("builds a high-quality MP4 delogo command", () => {
    const command = buildDelogoCommand("input.mp4", "output.mp4", {
      x: 0.875, y: 0.79, width: 0.055, height: 0.09,
    }, 1920, 1080);
    expect(command).toContain("delogo=x=1680:y=854:w=106:h=98");
    expect(command).toContain("libx264");
    expect(command).toContain("20");
    expect(command.at(-1)).toBe("output.mp4");
  });
});
