# CLEARFRAME 视频去水印平台

一个只在当前设备处理 MP4 的视频去水印工具。默认使用浏览器内的 ffmpeg.wasm；也可以由用户主动启动仅监听 `127.0.0.1` 的原生 sidecar，使用系统 FFmpeg 加速处理。另提供非默认的 VEO 第三方 CLI 实验适配模式。文件不会上传到远端服务器。

## 功能

- 拖放或一次选择多个 MP4 文件，组成批量处理队列
- 浏览器模式和本地加速模式支持每个视频独立框选水印、拖动、缩放和键盘微调；VEO 实验模式由第三方 CLI 自动定位其支持的固定水印
- 使用 FFmpeg `delogo` 内容插值逐帧修复
- 可在“浏览器模式”“本地加速模式”和非默认的“VEO 专属去水印（实验）”之间明确切换
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

启动后，在页面中选择“本地加速模式”并点击“一键配对”。sidecar 会显示操作系统原生确认窗口；请核对网页与弹窗中的六位短码，再明确允许连接。

真正的随机认证会话只通过 `HttpOnly + SameSite=Strict` Cookie 下发，页面 JavaScript 无法读取；页面、URL 与终端均不显示明文认证令牌。会话只保存在 sidecar 内存中，sidecar 重启后需要重新配对。除创建/查询一次性配对挑战外，媒体处理、CLI 选择和健康检查接口仍然要求有效会话。用于无界面自动化的 `CLEARFRAME_PAIRING_TOKEN` Bearer 兼容通道仍可显式配置，但默认随机值不会打印。

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

## 可选：VEO 专属去水印（实验）

此模式只是一层安全适配，不包含第三方算法或二进制。CLEARFRAME 不会扫描磁盘、自动下载或打包 VeoWatermarkRemover；用户需要自行从[上游 v0.6.4-demo 发布页](https://github.com/allenk/VeoWatermarkRemover/releases/tag/v0.6.4-demo)了解风险并下载。

截至 2026-07-13，上游页面声明公开构建和 MIT，但仓库文件列表没有展示可审计的实现源码或独立 `LICENSE` 文件。CLEARFRAME 因此仍把它视为用户自行安装的第三方闭源二进制，不对其安全性、许可证或处理质量背书。

使用步骤：

1. 运行 `pnpm sidecar`，在页面点击“一键配对”，核对六位短码并在系统弹窗确认。
2. 切换到“VEO 专属去水印”实验模式，点击“选择本地 CLI”。
3. sidecar 弹出操作系统原生文件选择器；网页不会获得真实可执行路径，也不能用 `<input type=file>` 直接执行程序。
4. 只有普通文件、当前平台可执行格式、执行权限与已知解压后二进制 SHA-256 全部通过后，处理按钮才会启用。

当前严格信任表仅包含已实测的 macOS Universal v0.6.4-demo 解压后二进制：

```text
eff4d1b366301aa3fbc97717313200240c8570d6b312a83ea8d929deba924df4
```

发布页给出的 Windows/Linux/macOS SHA 不能直接当作解压后二进制哈希；在获得并核验对应平台的解压后二进制哈希前，Windows 与 Linux 会明确阻止执行。

### VEO 实验处理与验收

- sidecar 以 `spawn(..., { shell: false })` 和固定的 `-i <input> -o <intermediate>` 参数调用已经校验的 CLI，不接受网页传入任意参数。
- 原片、CLI 中间输出和最终输出使用三个不同路径，不覆盖用户输入。
- 最终封装对处理后视频轨执行 bitstream copy，并从原片直接复制音频、兼容字幕、章节与元数据，不进行第二次视频编码。
- H.264/AAC MP4 会分别提取轨道并验证：处理中间视频轨与最终视频轨 SHA-256 相同，原片音频轨与最终音频轨 SHA-256 相同。
- “媒体完整性”与“视频码率容差”是两个独立结果。码率超出默认 ±10% 会明确警告，不会二次编码或填充文件来伪装恢复。
- M4 历史样片实测约 1 fps；Citypop 视频码率曾下降 27.86%，Persian 曾下降 11.58%。局部仍可能出现模糊、棕灰色斑或其他残留。
- CLI 未选择、哈希/平台校验失败或 sidecar 离线时不会自动执行，也不会自动切换到 delogo；回退必须由用户明确确认。

## 输入与输出

- 输入：一个或多个 MP4；每个文件最大 200MB、最长 5 分钟
- 默认选区：`x=0.875, y=0.79, width=0.055, height=0.09`
- 浏览器模式输出：H.264、CRF 20、`veryfast`、YUV420P，音频直接复制
- 本地加速输出：优先继承 H.264/HEVC 家族并按源视频码率闭环验证
- 默认使用稳定的单线程 WASM 核心；`?threads=1` 可启用实验性多线程核心

`delogo` 内容插值适合固定的小型水印。复杂纹理、运动边缘或选区偏大时仍可能出现模糊、暗斑或边缘痕迹，它不等同于 AI 语义修复。VEO 第三方 CLI 仅作为用户主动启用的实验适配存在，不是默认主流程；本项目不复制其算法或二进制，也不使用 reverse-alpha 遮罩修补实验作为主流程。
