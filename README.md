# CLEARFRAME 视频去水印平台

一个只在当前设备处理 MP4 的视频去水印工具。默认使用浏览器内的 ffmpeg.wasm；也可以由用户主动启动仅监听 `127.0.0.1` 的原生 sidecar，使用系统 FFmpeg 加速处理。文件不会上传到远端服务器。

## 功能

- 拖放或一次选择多个 MP4 文件，组成批量处理队列
- 每个视频独立定位右下角固定水印，并支持拖动、缩放和键盘微调
- 使用 FFmpeg `delogo` 内容插值逐帧修复
- 可在“浏览器模式”和“本地加速模式”之间明确切换
- 串行处理队列以控制浏览器内存占用，显示每项与总体进度
- 支持整批取消、失败项重试和再次处理
- 每个视频独立进行原片/结果对比预览，下载 `{原文件名}-clean.mp4`
- 多个完成结果可通过“全部下载”打包为一个 ZIP，重复文件名会自动编号

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

## 可选：本地原生加速

sidecar 需要 Node.js 20+，以及可在终端运行的 `ffmpeg`、`ffprobe`。它不会随网页自动启动，也不会监听局域网地址。

```bash
# 先检查 FFmpeg、ffprobe 和实际可用的编码器
pnpm sidecar:check

# 启动仅监听 127.0.0.1:3210 的本地服务
pnpm sidecar
```

启动后，终端会显示本次随机生成的配对令牌。在页面中选择“本地加速模式”，粘贴令牌并点击“连接本机”。令牌不会被发送到 `127.0.0.1` / `localhost` 以外的地址。

可指定 FFmpeg 路径、端口与码率容差：

```bash
pnpm sidecar -- --ffmpeg=/absolute/path/ffmpeg \
  --ffprobe=/absolute/path/ffprobe \
  --port=3210 \
  --bitrate-tolerance=0.05
```

- Apple Silicon 会实际编码一帧来探测 `h264_videotoolbox` / `hevc_videotoolbox`。
- Windows 会实际编码一帧来探测 `h264_nvenc` / `hevc_nvenc`；即使 FFmpeg 列出了编码器，只要运行测试失败，就不会标记为可用。
- 硬件编码失败时，同一任务会明确回退到通过探测的 `libx264` / `libx265`。
- 网页本身不能直接调用 VideoToolbox 或 NVENC；未启动 sidecar 时请使用浏览器模式。

### 本地加速的媒体保持策略

- 视频像素经 `delogo` 修改后必须重新编码；不会承诺视频 bitstream 与源文件相同。
- 尽量继承分辨率、显示宽高比、像素格式、codec 家族和色彩标签。
- 使用输入时间戳与 `fps_mode=passthrough`；不通过强制 `-r` 改写 VFR 时间轴。
- 音频优先直接复制，并对输入/输出音频 packet bitstream 做 SHA-256 复核。
- MP4 兼容时复制字幕、章节和容器元数据。
- 以 ffprobe 的源视频流码率为目标；默认允许 ±10%，可配置为 ±5%。超界时按源/实际码率比例最多校正重试一次。
- 输出完成后检查可解码性、DTS 单调性、视频 PTS、帧数、时长、音画起点/时长与音频哈希。

## 输入与输出

- 输入：一个或多个 MP4；每个文件最大 200MB、最长 5 分钟
- 默认选区：`x=0.875, y=0.79, width=0.055, height=0.09`
- 浏览器模式输出：H.264、CRF 20、`veryfast`、YUV420P，音频直接复制
- 本地加速输出：优先继承 H.264/HEVC 家族并按源视频码率闭环验证
- 默认使用稳定的单线程 WASM 核心；`?threads=1` 可启用实验性多线程核心

`delogo` 内容插值适合固定的小型水印。复杂纹理、运动边缘或选区偏大时仍可能出现模糊、暗斑或边缘痕迹，它不等同于 AI 语义修复。本项目不集成闭源 VeoWatermarkRemover，也不使用 reverse-alpha 遮罩修补实验作为主流程。
