import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const HASH_BYTES = 64;
const VERSION = "scrypt-v1";

export function normalizeMemberEmail(email: string) {
  return email.trim().toLowerCase();
}

export function assertStrongPassword(password: string) {
  if (password.length < 12 || password.length > 128 || Buffer.byteLength(password, "utf8") > 256) {
    throw new Error("Use a password of 12 to 128 characters.");
  }
}

async function derive(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, HASH_BYTES, SCRYPT_OPTIONS, (error, digest) => {
      if (error) reject(error);
      else resolve(digest);
    });
  });
}

export async function hashMemberPassword(password: string) {
  assertStrongPassword(password);
  const salt = randomBytes(16);
  const digest = await derive(password, salt);
  return `${VERSION}$${salt.toString("hex")}$${digest.toString("hex")}`;
}

export async function verifyMemberPassword(password: string, stored: string) {
  const [version, saltHex, digestHex, ...extra] = stored.split("$");
  if (version !== VERSION || extra.length || !/^[0-9a-f]{32}$/.test(saltHex ?? "") ||
      !/^[0-9a-f]{128}$/.test(digestHex ?? "")) return false;
  try {
    const expected = Buffer.from(digestHex, "hex");
    const actual = await derive(password, Buffer.from(saltHex, "hex"));
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// Work for unknown addresses too, so a failed login does not reveal account
// existence through an instant response compared with an expensive hash check.
export async function delayUnknownMemberPassword(password: string) {
  await derive(password, Buffer.alloc(16));
}
