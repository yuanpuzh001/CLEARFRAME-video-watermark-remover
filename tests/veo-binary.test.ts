// @vitest-environment node
import { createHash } from "node:crypto";
import { chmod, mkdtemp, rmdir, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CommandRunner } from "../sidecar/process";
import { inspectVeoCli, pickVeoCliPath } from "../sidecar/veo-binary";

const pathsToRemove: string[] = [];
const directoriesToRemove: string[] = [];

afterEach(async () => {
  while (pathsToRemove.length) await unlink(pathsToRemove.pop()!);
  while (directoriesToRemove.length) await rmdir(directoriesToRemove.pop()!);
});

async function fakeExecutable(magic: Buffer, suffix: string): Promise<{ path: string; sha256: string }> {
  const directory = await mkdtemp(join(tmpdir(), "clearframe-veo-test-"));
  const path = join(directory, `veo-${suffix}`);
  const contents = Buffer.concat([magic, Buffer.from("fake-cli-for-tests-only")]);
  await writeFile(path, contents);
  await chmod(path, 0o755);
  pathsToRemove.push(path);
  directoriesToRemove.push(directory);
  return { path, sha256: createHash("sha256").update(contents).digest("hex") };
}

describe("VEO CLI binary validation", () => {
  it("accepts only a platform-matching executable with a trusted extracted-binary hash", async () => {
    const fake = await fakeExecutable(Buffer.from("cffaedfe", "hex"), "mac");
    const result = await inspectVeoCli(fake.path, {
      platform: "darwin",
      trustedHashes: { darwin: { [fake.sha256]: "v0.6.4-demo-test" } },
    });

    expect(result).toMatchObject({
      valid: true,
      path: fake.path,
      sha256: fake.sha256,
      version: "v0.6.4-demo-test",
      platform: "darwin",
    });
  });

  it("reports the SHA but blocks an untrusted executable", async () => {
    const fake = await fakeExecutable(Buffer.from("7f454c46", "hex"), "linux");
    const result = await inspectVeoCli(fake.path, { platform: "linux", trustedHashes: { linux: {} } });

    expect(result.valid).toBe(false);
    expect(result.sha256).toBe(fake.sha256);
    expect(result.error).toContain("尚无可核验");
  });

  it("rejects a file for the wrong runtime platform before trusting its hash", async () => {
    const fake = await fakeExecutable(Buffer.from("4d5a0000", "hex"), "windows");
    const result = await inspectVeoCli(fake.path, {
      platform: "darwin",
      trustedHashes: { darwin: { [fake.sha256]: "v0.6.4-demo-test" } },
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain("不是当前 darwin 平台");
  });

  it("rejects symbolic links even when they target a trusted executable", async () => {
    const fake = await fakeExecutable(Buffer.from("cffaedfe", "hex"), "target");
    const linkPath = `${fake.path}-link`;
    await symlink(fake.path, linkPath);
    pathsToRemove.push(linkPath);
    const result = await inspectVeoCli(linkPath, {
      platform: "darwin",
      trustedHashes: { darwin: { [fake.sha256]: "v0.6.4-demo-test" } },
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("普通文件");
  });

  it("uses a fixed native picker command and treats cancellation as no selection", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const runner: CommandRunner = async (command, args) => {
      calls.push({ command, args });
      return { code: 2, stdout: "", stderr: "User canceled", durationMs: 1 };
    };

    await expect(pickVeoCliPath({ platform: "win32", runner })).resolves.toBeUndefined();
    expect(calls[0].command).toBe("powershell.exe");
    expect(calls[0].args).not.toContain("shell");
  });
});
