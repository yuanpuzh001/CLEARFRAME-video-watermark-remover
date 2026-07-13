import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UploadZone } from "../src/components/UploadZone";

describe("UploadZone", () => {
  it("passes every selected MP4 to the batch callback", () => {
    const onSelect = vi.fn();
    const { container } = render(<UploadZone onSelect={onSelect} />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    const files = [
      new File(["one"], "one.mp4", { type: "video/mp4" }),
      new File(["two"], "two.mp4", { type: "video/mp4" }),
    ];

    expect(input?.multiple).toBe(true);
    expect(container.querySelector(".upload-zone")).toHaveAttribute("id", "input-queue");
    expect(screen.getByRole("button", { name: "选择 MP4 视频" })).toBeInTheDocument();
    expect(screen.getByText("可以选择多个文件")).toBeInTheDocument();
    fireEvent.change(input!, { target: { files } });
    expect(onSelect).toHaveBeenCalledWith(files);
  });
});
