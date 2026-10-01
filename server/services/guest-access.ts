import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function guestTokenHash(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createGuestAccess() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: guestTokenHash(token) };
}

export function hasGuestAccess(booking: { userId: number | null; guestAccessHash: string | null }, token?: string | null) {
  if (booking.userId !== null || !booking.guestAccessHash || !token || token.length > 128) return false;
  const expected = Buffer.from(booking.guestAccessHash, "hex");
  const actual = Buffer.from(guestTokenHash(token), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
