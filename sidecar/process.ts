import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface RunCommandOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export type CommandRunner = (
  command: string,
  args: string[],
  options?: RunCommandOptions,
) => Promise<CommandResult>;

export const runCommand: CommandRunner = (command, args, options = {}) => new Promise((resolve, reject) => {
  const startedAt = performance.now();
  const child = spawn(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    signal: options.signal,
    shell: false,
  });
  let stdout = "";
  let stderr = "";
  const timer = options.timeoutMs
    ? setTimeout(() => child.kill("SIGKILL"), options.timeoutMs)
    : undefined;

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });
  child.on("error", (error) => {
    if (timer) clearTimeout(timer);
    reject(error);
  });
  child.on("close", (code) => {
    if (timer) clearTimeout(timer);
    resolve({
      code: code ?? -1,
      stdout,
      stderr,
      durationMs: performance.now() - startedAt,
    });
  });
});
