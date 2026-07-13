export const WORKFLOW_LABELS = {
  inputQueue: "INPUT QUEUE / 01",
  process: "PROCESS / 02",
  watermarkSelection: "WATERMARK SELECTION / 03",
  outputVideo: "OUTPUT VIDEO / 04",
} as const;

export const WORKFLOW_SECTIONS = {
  inputQueue: { id: "input-queue", index: "01", label: "处理队列" },
  process: { id: "process", index: "02", label: "批量去水印" },
  watermarkSelection: { id: "watermark-selection", index: "03", label: "选择水印区域" },
  outputVideo: { id: "output-video", index: "04", label: "修复结果" },
} as const;
