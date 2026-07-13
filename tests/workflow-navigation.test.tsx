import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkflowNavigation } from "../src/components/WorkflowNavigation";

describe("WorkflowNavigation", () => {
  it("links the four current module names to their workspace sections", () => {
    render(<WorkflowNavigation itemCount={3} />);

    expect(screen.getByRole("link", { name: "01 处理队列" })).toHaveAttribute("href", "#input-queue");
    expect(screen.getByRole("link", { name: "02 批量去水印" })).toHaveAttribute("href", "#process");
    expect(screen.getByRole("link", { name: "03 选择水印区域" })).toHaveAttribute("href", "#watermark-selection");
    expect(screen.getByRole("link", { name: "04 修复结果" })).toHaveAttribute("href", "#output-video");
  });

  it("uses the single-video process module name when only one item is selected", () => {
    render(<WorkflowNavigation itemCount={1} />);

    expect(screen.getByRole("link", { name: "02 一键去水印" })).toHaveAttribute("href", "#process");
  });
});
