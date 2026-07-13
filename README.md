# CLEARFRAME 视频去水印平台

一个完全在浏览器本地运行的 MP4 视频去水印工具。文件不会上传服务器，处理结果可以直接预览和下载。

## 功能

- 拖放或选择单个 MP4 文件
- 自动定位右下角固定水印，并支持拖动、缩放和键盘微调
- 使用 FFmpeg `delogo` 内容插值逐帧修复
- 显示处理进度，支持取消、失败重试和再次处理
- 原片/结果对比预览，下载 `{原文件名}-clean.mp4`

## 本地运行

需要 Node.js 20 或更高版本，以及 pnpm。

```bash
pnpm install
pnpm dev
```

浏览器打开终端显示的本地地址。建议使用桌面版 Chrome 或 Edge。

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm preview
```

开发与预览服务已经配置 COOP/COEP 响应头。部署到静态托管平台时，也需要为 HTML、Worker 和 WASM 资源配置相同响应头。

## 输入与输出

- 输入：单个 MP4，最大 200MB、最长 5 分钟
- 默认选区：`x=0.875, y=0.79, width=0.055, height=0.09`
- 输出：H.264、CRF 20、`veryfast`、YUV420P，音频直接复制
- 默认使用稳定的单线程 WASM 核心；`?threads=1` 可启用实验性多线程核心

内容插值适合固定的小型水印。复杂运动纹理可能出现轻微模糊，它不等同于 AI 语义修复。
