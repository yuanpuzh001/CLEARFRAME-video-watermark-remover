import { rename, unlink } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import type { NormalizedRegion } from "../src/types/video";
import type { NativeCapabilities, CodecFamily } from "./capabilities";
import type { SidecarConfig } from "./config";
import { buildNativeDelogoPlan, type NativeEncodePlan } from "./encode-plan";
import { probeMedia } from "./media";
import type { CommandRunner } from "./process";
import { runCommand } from "./process";
import { correctedTargetBitrate, verifyNativeOutput, type VerificationReport } from "./verify";

export interface NativeJobProgress {
  progress: number;
  message: string;
}

export interface NativeJobResult {
  plan: NativeEncodePlan;
  verification: VerificationReport;
  bitrateAttempts: number;
  encoderFallback: boolean;
  elapsedMs: number;
  realtimeFactor: number;
}

function withSoftwareEncoder(capabilities: NativeCapabilities, family: CodecFamily): NativeCapabilities | undefined {
  const software = capabilities.encoders.find((encoder) => (
    encoder.family === family && encoder.kind === "software" && encoder.available
  ));
  if (!software) return undefined;
  return { ...capabilities, selected: { ...capabilities.selected, [family]: software.name } };
}

async function removeIfPresent(path: string): Promise<void> {
  try { await unlink(path); } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
}

export async function runNativeDelogoJob(options: {
  inputPath: string;
  outputPath: string;
  region: NormalizedRegion;
  capabilities: NativeCapabilities;
  config: SidecarConfig;
  signal?: AbortSignal;
  runner?: CommandRunner;
  onProgress?: (progress: NativeJobProgress) => void;
}): Promise<NativeJobResult> {
  const runner = options.runner ?? runCommand;
  const notify = options.onProgress ?? (() => undefined);
  const startedAt = performance.now();
  notify({ progress: 0.03, message: "正在分析源媒体…" });
  const source = await probeMedia(options.inputPath, options.config.ffprobePath, runner);
  let capabilities = options.capabilities;
  let targetBitrate = source.sourceVideoBitrate;
  let encoderFallback = false;
  let finalPlan: NativeEncodePlan | undefined;
  let finalVerification: VerificationReport | undefined;
  let bitrateAttempts = 0;
  let finalAttemptPath = "";

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    bitrateAttempts = attempt;
    const attemptPath = `${options.outputPath}.attempt-${attempt}.mp4`;
    await removeIfPresent(attemptPath);
    let plan = buildNativeDelogoPlan({
      inputPath: options.inputPath,
      outputPath: attemptPath,
      region: options.region,
      analysis: source,
      capabilities,
      targetBitrate,
    });
    notify({ progress: attempt === 1 ? 0.12 : 0.58, message: `${plan.hardware ? "硬件" : "软件"}编码处理中…` });
    let encoded = await runner(options.config.ffmpegPath, plan.args, { signal: options.signal, timeoutMs: 900_000 });
    if (encoded.code !== 0 && plan.hardware) {
      const softwareCapabilities = withSoftwareEncoder(capabilities, plan.codecFamily);
      if (softwareCapabilities) {
        encoderFallback = true;
        capabilities = softwareCapabilities;
        await removeIfPresent(attemptPath);
        plan = buildNativeDelogoPlan({
          inputPath: options.inputPath,
          outputPath: attemptPath,
          region: options.region,
          analysis: source,
          capabilities,
          targetBitrate,
        });
        notify({ progress: attempt === 1 ? 0.18 : 0.62, message: "硬件编码失败，正在回退软件编码…" });
        encoded = await runner(options.config.ffmpegPath, plan.args, { signal: options.signal, timeoutMs: 900_000 });
      }
    }
    if (encoded.code !== 0) {
      await removeIfPresent(attemptPath);
      throw new Error(`FFmpeg 处理失败：${encoded.stderr.trim() || `退出码 ${encoded.code}`}`);
    }
    notify({ progress: attempt === 1 ? 0.5 : 0.82, message: "正在验证媒体完整性…" });
    const verification = await verifyNativeOutput({
      inputPath: options.inputPath,
      outputPath: attemptPath,
      source,
      ffmpegPath: options.config.ffmpegPath,
      ffprobePath: options.config.ffprobePath,
      bitrateTolerance: options.config.bitrateTolerance,
      runner,
    });
    if (!verification.valid) {
      await removeIfPresent(attemptPath);
      throw new Error(`输出验证失败：${verification.errors.join("；")}`);
    }
    finalPlan = plan;
    finalVerification = verification;
    finalAttemptPath = attemptPath;
    if (verification.bitrateWithinTolerance || attempt === 2) break;
    targetBitrate = correctedTargetBitrate(
      plan.targetBitrate,
      verification.sourceVideoBitrate,
      verification.actualVideoBitrate,
    );
    await removeIfPresent(attemptPath);
    notify({ progress: 0.55, message: "码率超出容差，正在校正重试…" });
  }

  if (!finalPlan || !finalVerification || !finalAttemptPath) throw new Error("原生处理没有生成有效结果");
  await removeIfPresent(options.outputPath);
  await rename(finalAttemptPath, options.outputPath);
  const elapsedMs = performance.now() - startedAt;
  notify({ progress: 1, message: "本地加速处理完成" });
  return {
    plan: finalPlan,
    verification: finalVerification,
    bitrateAttempts,
    encoderFallback,
    elapsedMs,
    realtimeFactor: elapsedMs > 0 ? source.durationSeconds / (elapsedMs / 1000) : 0,
  };
}
