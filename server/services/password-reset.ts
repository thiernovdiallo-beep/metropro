import { createHash, randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";

export const PASSWORD_RESET_MS = 24 * 60 * 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function passwordResetTokenHash(token: string): string | null {
  if (!TOKEN_PATTERN.test(token)) return null;
  return createHash("sha256").update("metropro:member-password-reset:v1:").update(token, "utf8").digest("hex");
}

export function createPasswordResetToken() {
  const token = randomBytes(32).toString("base64url");
  const hash = passwordResetTokenHash(token);
  if (!hash) throw new Error("Could not generate a password reset token");
  return { token, hash };
}

export function createPasswordResetRateLimiter({ windowMs, perClientLimit, globalLimit }: {
  windowMs: number; perClientLimit: number; globalLimit: number;
}) {
  let windowEndsAt = 0;
  let totalRequests = 0;
  const requestsByClient = new Map<string, number>();
  return (clientKey: string, now = Date.now()): void => {
    if (now >= windowEndsAt) {
      windowEndsAt = now + windowMs;
      totalRequests = 0;
      requestsByClient.clear();
    }
    const requests = requestsByClient.get(clientKey) ?? 0;
    if (requests >= perClientLimit || totalRequests >= globalLimit) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Reset requests are temporarily limited. Please try again shortly." });
    }
    requestsByClient.set(clientKey, requests + 1);
    totalRequests += 1;
  };
}

// Bound both abuse from a single browser and total token creation per process.
export const throttlePasswordReset = createPasswordResetRateLimiter({
  windowMs: 15 * 60 * 1000,
  perClientLimit: 5,
  globalLimit: 300,
});
