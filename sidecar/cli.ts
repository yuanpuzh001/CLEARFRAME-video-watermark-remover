import { createSidecarConfig } from "./config";
import { detectNativeCapabilities } from "./capabilities";
import { createSidecarServer } from "./server";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const config = createSidecarConfig(args);
  const capabilities = await detectNativeCapabilities({
    ffmpegPath: config.ffmpegPath,
    ffprobePath: config.ffprobePath,
  });
  if (args.includes("--check")) {
    process.stdout.write(`${JSON.stringify({ ...capabilities, bitrateTolerance: config.bitrateTolerance }, null, 2)}\n`);
    return;
  }
  const app = await createSidecarServer({ config, capabilities });
  await new Promise<void>((resolve, reject) => {
    app.server.once("error", reject);
    app.server.listen(config.port, config.host, resolve);
  });
  process.stdout.write([ 
    "CLEARFRAME 本地加速服务已启动",
    `地址：http://${config.host}:${config.port}`,
    `配对令牌：${config.token}`,
    `H.264：${capabilities.selected.h264 ?? "不可用"}`,
    `HEVC：${capabilities.selected.hevc ?? "不可用"}`,
    `码率容差：±${(config.bitrateTolerance * 100).toFixed(0)}%`,
  ].join("\n") + "\n");
  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.once("SIGINT", () => { void shutdown(); });
  process.once("SIGTERM", () => { void shutdown(); });
}

main().catch((error) => {
  process.stderr.write(`sidecar 启动失败：${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
