// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PairingManager } from "../sidecar/pairing";

describe("sidecar pairing manager", () => {
  it("issues an HttpOnly session only after explicit approval", async () => {
    const manager = new PairingManager(async () => true);
    const challenge = manager.create("http://127.0.0.1:5173");
    expect(challenge.code).toMatch(/^\d{6}$/);
    await Promise.resolve();

    const consumed = manager.consume(challenge.id, challenge.origin);
    expect(consumed?.challenge.status).toBe("approved");
    expect(consumed?.setCookie).toContain("HttpOnly");
    expect(consumed?.setCookie).toContain("SameSite=Strict");
    const cookie = consumed?.setCookie?.split(";")[0];
    expect(manager.authenticated(cookie, challenge.origin)).toBe(true);
    expect(manager.authenticated(cookie, "http://localhost:5173")).toBe(false);
  });

  it("does not create a session when the native confirmation is rejected", async () => {
    const manager = new PairingManager(async () => false);
    const challenge = manager.create("http://127.0.0.1:5173");
    await Promise.resolve();

    const consumed = manager.consume(challenge.id, challenge.origin);
    expect(consumed?.challenge.status).toBe("denied");
    expect(consumed?.setCookie).toBeUndefined();
  });

  it("expires challenges and sessions without exposing their secrets", async () => {
    let now = 1_000;
    const manager = new PairingManager(async () => true, () => now);
    const challenge = manager.create("http://127.0.0.1:5173");
    await Promise.resolve();
    now += 61_000;

    expect(manager.consume(challenge.id, challenge.origin)?.challenge.status).toBe("expired");
    expect(JSON.stringify(challenge)).not.toContain("session");
  });
});
