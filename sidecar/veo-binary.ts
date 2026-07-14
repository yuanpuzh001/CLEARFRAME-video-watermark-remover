import { createHash } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { access, lstat, open } from "node:fs/promises";
import { basename } from "node:path";
import type { CommandRunner } from "./process";
import { runCommand } from "./process";

export const VEO_RELEASE_VERSION = "v0.6.4-demo";
export const VEO_RELEASE_URL = "https://github.com/allenk/VeoWatermarkRemover/releases/tag/v0.6.4-demo";

export type VeoCliPlatform = "darwin" | "win32" | "linux";

export interface VeoCliSelection {
  path: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  platform: VeoCliPlatform;
  version?: string;
  valid: boolean;
  error?: string;
}

export type VeoTrustedHashes = Partial<Record<VeoCliPlatform, Record<string, string>>>;

export const VEO_TRUSTED_BINARY_HASHES: VeoTrustedHashes = {
  darwin: {
    eff4d1b366301aa3fbc97717313200240c8570d6b312a83ea8d929deba924df4: VEO_RELEASE_VERSION,
  },
};

function supportedPlatform(value: NodeJS.Platform): value is VeoCliPlatform {
  return value === "darwin" || value === "win32" || value === "linux";
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function readMagic(path: string): Promise<string> {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(4);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).toString("hex");
  } finally {
    await handle.close();
  }
}

function platformMatchesMagic(platform: VeoCliPlatform, magic: string): boolean {
  if (platform === "win32") return magic.startsWith("4d5a");
  if (platform === "linux") return magic === "7f454c46";
  return new Set([
    "cafebabe", "cafebabf", "bebafeca", "bfbafeca",
    "feedface", "feedfacf", "cefaedfe", "cffaedfe",
  ]).has(magic);
}

function invalidSelection(
  path: string,
  platform: VeoCliPlatform,
  error: string,
  details: Partial<Pick<VeoCliSelection, "sizeBytes" | "sha256">> = {},
): VeoCliSelection {
  return {
    path,
    fileName: basename(path),
    sizeBytes: details.sizeBytes ?? 0,
    sha256: details.sha256 ?? "",
    platform,
    valid: false,
    error,
  };
}

export async function inspectVeoCli(path: string, options: {
  platform?: NodeJS.Platform;
  trustedHashes?: VeoTrustedHashes;
} = {}): Promise<VeoCliSelection> {
  const runtimePlatform = options.platform ?? process.platform;
  if (!supportedPlatform(runtimePlatform)) {
    throw new Error(`VEO CLI 选择暂不支持 ${runtimePlatform} 平台`);
  }
  const platform = runtimePlatform;
  let info;
  try {
    info = await lstat(path);
  } catch {
    return invalidSelection(path, platform, "所选 CLI 文件不存在或无法读取");
  }
  if (!info.isFile() || info.isSymbolicLink()) {
    return invalidSelection(path, platform, "只能选择普通文件，不能选择目录或特殊文件", { sizeBytes: info.size });
  }
  if (platform !== "win32") {
    try {
      await access(path, constants.X_OK);
    } catch {
      return invalidSelection(path, platform, "所选文件没有可执行权限", { sizeBytes: info.size });
    }
  }
  const magic = await readMagic(path);
  if (!platformMatchesMagic(platform, magic)) {
    return invalidSelection(path, platform, `所选文件不是当前 ${platform} 平台的可执行文件`, { sizeBytes: info.size });
  }
  const sha256 = await hashFile(path);
  const trustedHashes = options.trustedHashes ?? VEO_TRUSTED_BINARY_HASHES;
  const version = trustedHashes[platform]?.[sha256.toLowerCase()];
  if (!version) {
    const hasPlatformHashes = Object.keys(trustedHashes[platform] ?? {}).length > 0;
    return invalidSelection(
      path,
      platform,
      hasPlatformHashes
        ? "SHA-256 与已知的官方 v0.6.4-demo 二进制不匹配，已阻止执行"
        : `当前版本尚无可核验的 ${platform} 解压后二进制 SHA-256，已阻止执行`,
      { sizeBytes: info.size, sha256 },
    );
  }
  return {
    path,
    fileName: basename(path),
    sizeBytes: info.size,
    sha256,
    platform,
    version,
    valid: true,
  };
}

function pickerCommand(platform: VeoCliPlatform): { command: string; args: string[] } {
  if (platform === "darwin") {
    return {
      command: "osascript",
      args: ["-e", "POSIX path of (choose file with prompt \"选择 VeoWatermarkRemover v0.6.4-demo CLI\")"],
    };
  }
  if (platform === "win32") {
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "$dialog = New-Object System.Windows.Forms.OpenFileDialog",
      "$dialog.Title = '选择 VeoWatermarkRemover v0.6.4-demo CLI'",
      "$dialog.CheckFileExists = $true",
      "if ($dialog.ShowDialog() -eq 'OK') { [Console]::Out.Write($dialog.FileName) } else { exit 2 }",
    ].join("; ");
    return { command: "powershell.exe", args: ["-NoProfile", "-STA", "-Command", script] };
  }
  return {
    command: "zenity",
    args: ["--file-selection", "--title=选择 VeoWatermarkRemover v0.6.4-demo CLI"],
  };
}

export async function pickVeoCliPath(options: {
  platform?: NodeJS.Platform;
  runner?: CommandRunner;
} = {}): Promise<string | undefined> {
  const runtimePlatform = options.platform ?? process.platform;
  if (!supportedPlatform(runtimePlatform)) {
    throw new Error(`当前 ${runtimePlatform} 平台暂不支持原生 CLI 选择器`);
  }
  const runner = options.runner ?? runCommand;
  const picker = pickerCommand(runtimePlatform);
  let result;
  try {
    result = await runner(picker.command, picker.args, { timeoutMs: 300_000 });
  } catch (error) {
    throw new Error(`无法打开本机文件选择器：${error instanceof Error ? error.message : "未知错误"}`);
  }
  if (result.code !== 0) {
    const cancelled = result.code === 2 || /cancel|取消|user canceled|-128/i.test(result.stderr);
    if (cancelled) return undefined;
    throw new Error(`本机文件选择器启动失败：${result.stderr.trim() || `退出码 ${result.code}`}`);
  }
  const path = result.stdout.trim();
  return path || undefined;
}

export async function selectVeoCli(options: {
  platform?: NodeJS.Platform;
  runner?: CommandRunner;
  trustedHashes?: VeoTrustedHashes;
} = {}): Promise<VeoCliSelection | undefined> {
  const path = await pickVeoCliPath(options);
  if (!path) return undefined;
  return inspectVeoCli(path, options);
}
