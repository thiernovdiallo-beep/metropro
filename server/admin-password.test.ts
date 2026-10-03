import { describe, expect, it } from "vitest";
import { ADMIN_SESSION_MS, ADMIN_SETUP_MS, adminSetupTokenHash, createAdminSetupToken } from "./services/admin-auth";
import { sdk } from "./_core/sdk";

describe("existing-admin password enrollment", () => {
  it("generates independent 256-bit URL-safe tokens and stores only their SHA-256 digests", () => {
    const first = createAdminSetupToken();
    const second = createAdminSetupToken();
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second.token).not.toBe(first.token);
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.hash).not.toContain(first.token);
    expect(adminSetupTokenHash(first.token)).toBe(first.hash);
    expect(adminSetupTokenHash(second.token)).not.toBe(first.hash);
    expect(adminSetupTokenHash("malformed-token")).toBeNull();
  });

  it("expires admin password sessions after eight hours and setup links after one day", async () => {
    expect(ADMIN_SESSION_MS).toBe(8 * 60 * 60 * 1000);
    expect(ADMIN_SETUP_MS).toBe(24 * 60 * 60 * 1000);
    const token = await sdk.createSessionToken("apple_admin_test", {
      name: "Administrator", memberSessionVersion: 12, expiresInMs: ADMIN_SESSION_MS,
    });
    const session = await sdk.verifySession(token);
    expect(session?.openId).toBe("apple_admin_test");
    expect(session?.memberSessionVersion).toBe(12);
  });
});
