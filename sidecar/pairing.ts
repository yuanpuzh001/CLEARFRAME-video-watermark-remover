import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { platform } from "node:os";
import type { CommandRunner } from "./process";
import { runCommand } from "./process";

export const PAIRING_COOKIE_NAME = "clearframe_sidecar_session";
const CHALLENGE_TTL_MS = 60_000;
const SESSION_TTL_MS = 8 * 60 * 60 * 1_000;

export type PairingChallengeState = "pending" | "approved" | "denied" | "expired";

export interface PairingChallengeView {
  id: string;
  code: string;
  origin: string;
  expiresAt: number;
  status: PairingChallengeState;
}

export type PairingApprover = (challenge: PairingChallengeView) => Promise<boolean>;

interface StoredChallenge extends PairingChallengeView {}

interface StoredSession {
  origin: string;
  expiresAt: number;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function cookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const entry of header.split(";")) {
    const [key, ...value] = entry.trim().split("=");
    if (key === name) return value.join("=");
  }
  return undefined;
}

function publicChallenge(challenge: StoredChallenge): PairingChallengeView {
  return { ...challenge };
}

export class PairingManager {
  private readonly challenges = new Map<string, StoredChallenge>();
  private readonly sessions = new Map<string, StoredSession>();

  constructor(
    private readonly approver: PairingApprover,
    private readonly now: () => number = Date.now,
  ) {}

  private prune(): void {
    const now = this.now();
    for (const [id, challenge] of this.challenges) {
      if (challenge.expiresAt <= now) this.challenges.delete(id);
    }
    for (const [hash, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(hash);
    }
  }

  create(origin: string): PairingChallengeView {
    this.prune();
    const existing = [...this.challenges.values()].find((challenge) => (
      challenge.origin === origin && challenge.status === "pending"
    ));
    if (existing) return publicChallenge(existing);

    const challenge: StoredChallenge = {
      id: randomUUID(),
      code: String(randomInt(0, 1_000_000)).padStart(6, "0"),
      origin,
      expiresAt: this.now() + CHALLENGE_TTL_MS,
      status: "pending",
    };
    this.challenges.set(challenge.id, challenge);
    void this.approver(publicChallenge(challenge)).then((approved) => {
      const current = this.challenges.get(challenge.id);
      if (!current || current.status !== "pending") return;
      current.status = current.expiresAt <= this.now() ? "expired" : approved ? "approved" : "denied";
    }).catch(() => {
      const current = this.challenges.get(challenge.id);
      if (current?.status === "pending") current.status = "denied";
    });
    return publicChallenge(challenge);
  }

  consume(id: string, origin: string): { challenge: PairingChallengeView; setCookie?: string } | undefined {
    const challenge = this.challenges.get(id);
    if (!challenge || challenge.origin !== origin) return undefined;
    if (challenge.expiresAt <= this.now()) {
      this.challenges.delete(id);
      return { challenge: { ...publicChallenge(challenge), status: "expired" } };
    }
    if (challenge.status !== "approved") {
      if (challenge.status === "denied") this.challenges.delete(id);
      return { challenge: publicChallenge(challenge) };
    }

    const secret = randomBytes(32).toString("base64url");
    this.sessions.set(digest(secret), { origin, expiresAt: this.now() + SESSION_TTL_MS });
    this.challenges.delete(id);
    return {
      challenge: publicChallenge(challenge),
      setCookie: `${PAIRING_COOKIE_NAME}=${secret}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1_000}`,
    };
  }

  authenticated(cookieHeader: string | undefined, origin: string | undefined): boolean {
    if (!origin) return false;
    this.prune();
    const secret = cookieValue(cookieHeader, PAIRING_COOKIE_NAME);
    if (!secret) return false;
    const session = this.sessions.get(digest(secret));
    return Boolean(session && session.origin === origin && session.expiresAt > this.now());
  }

  clear(): void {
    this.challenges.clear();
    this.sessions.clear();
  }
}

export async function requestNativePairingApproval(
  challenge: PairingChallengeView,
  runner: CommandRunner = runCommand,
): Promise<boolean> {
  const message = `CLEARFRAME 网页正在请求连接本机服务。\n\n核对码：${challenge.code}\n来源：${challenge.origin}\n\n仅在网页显示相同核对码时允许。`;
  if (platform() === "darwin") {
    const result = await runner("/usr/bin/osascript", [
      "-e", "on run argv",
      "-e", "display dialog (item 1 of argv) with title \"CLEARFRAME 安全配对\" buttons {\"拒绝\", \"允许\"} default button \"允许\" cancel button \"拒绝\" with icon caution",
      "-e", "end run",
      message,
    ], { timeoutMs: CHALLENGE_TTL_MS });
    return result.code === 0 && result.stdout.includes("button returned:允许");
  }
  if (platform() === "win32") {
    const encoded = Buffer.from(message, "utf16le").toString("base64");
    const script = `Add-Type -AssemblyName PresentationFramework; $m=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encoded}')); if ([System.Windows.MessageBox]::Show($m,'CLEARFRAME 安全配对','YesNo','Warning') -eq 'Yes') { Write-Output 'ALLOW' }`;
    const result = await runner("powershell.exe", ["-NoProfile", "-STA", "-Command", script], { timeoutMs: CHALLENGE_TTL_MS });
    return result.code === 0 && result.stdout.includes("ALLOW");
  }
  const result = await runner("zenity", ["--question", "--title=CLEARFRAME 安全配对", `--text=${message}`], { timeoutMs: CHALLENGE_TTL_MS });
  return result.code === 0;
}
