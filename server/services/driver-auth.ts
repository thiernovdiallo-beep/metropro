import { createHash, randomBytes } from "node:crypto";

export const DRIVER_SETUP_MS = 24 * 60 * 60 * 1000;
export const DRIVER_SESSION_MS = 12 * 60 * 60 * 1000;

export function driverSetupTokenHash(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createDriverSetupToken() {
  const token = randomBytes(32).toString("base64url");
  const hash = driverSetupTokenHash(token);
  if (!hash) throw new Error("Could not generate driver invitation");
  return { token, hash };
}
