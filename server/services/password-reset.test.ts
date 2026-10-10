import { describe, expect, it } from "vitest";
import { createPasswordResetRateLimiter, createPasswordResetToken, passwordResetTokenHash } from "./password-reset";

describe("customer password reset tokens", () => {
  it("creates URL-safe tokens and stores only a deterministic hash", () => {
    const first = createPasswordResetToken();
    const second = createPasswordResetToken();
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.hash).toHaveLength(64);
    expect(passwordResetTokenHash(first.token)).toBe(first.hash);
    expect(first.hash).not.toBe(second.hash);
    expect(passwordResetTokenHash("too-short")).toBeNull();
  });

  it("enforces per-client and global request limits within a window", () => {
    const throttle = createPasswordResetRateLimiter({ windowMs: 1_000, perClientLimit: 2, globalLimit: 3 });
    throttle("source:first", 100);
    throttle("source:first", 101);
    expect(() => throttle("source:first", 102)).toThrow(/limited/);
    throttle("source:second", 103);
    expect(() => throttle("source:third", 104)).toThrow(/limited/);
    expect(() => throttle("source:first", 1_100)).not.toThrow();
  });
});
