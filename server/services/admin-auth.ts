import { createHash, randomBytes } from "node:crypto";

export const ADMIN_SESSION_MS = 8 * 60 * 60 * 1000;
export const ADMIN_SETUP_MS = 24 * 60 * 60 * 1000;

// Existing admins have no activation timestamp. A newly promoted account must
// authenticate again: pre-promotion customer sessions must not gain admin rights.
export function adminSessionAfterGrant(adminEnabledAt: Date | null, issuedAtMs?: number): boolean {
  if (!adminEnabledAt) return true;
  return typeof issuedAtMs === "number" && Number.isSafeInteger(issuedAtMs) &&
    issuedAtMs > adminEnabledAt.getTime();
}

// 32 random bytes encode to 43 unpadded URL-safe characters. A malformed
// token is never used in a database lookup.
const SETUP_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function adminSetupTokenHash(token: string): string | null {
  if (!SETUP_TOKEN_PATTERN.test(token)) return null;
  return createHash("sha256").update(token, "utf8").digest("hex");
}

// Reuse the existing invite table without granting old enrollment links the
// authority to replace a password that has already been set.
export function adminResetTokenHash(token: string): string | null {
  if (!SETUP_TOKEN_PATTERN.test(token)) return null;
  return createHash("sha256").update("metropro:admin-password-reset:v1:").update(token, "utf8").digest("hex");
}

export function createAdminSetupToken() {
  const token = randomBytes(32).toString("base64url");
  const hash = adminSetupTokenHash(token);
  if (!hash) throw new Error("Could not generate an admin setup token");
  return { token, hash };
}

export function createAdminResetToken() {
  const token = randomBytes(32).toString("base64url");
  const hash = adminResetTokenHash(token);
  if (!hash) throw new Error("Could not generate an admin reset token");
  return { token, hash };
}
