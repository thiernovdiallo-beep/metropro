import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { driverPrivateProfiles } from "../../drizzle/schema";
import { getDb } from "../db";

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

function key() {
  const secret = process.env.MANUS_JWT_SECRET;
  const project = process.env.MANUS_PROJECT_ID;
  if (!secret || !project) throw new Error("Private driver storage is not configured");
  return Buffer.from(hkdfSync("sha256", Buffer.from(secret), Buffer.from(project), Buffer.from("metropro/driver-private/v1"), 32));
}

function encrypt(bytes: Buffer) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), nonce);
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString("base64");
}

function decrypt(ciphertext: string) {
  const bytes = Buffer.from(ciphertext, "base64");
  if (bytes.length < 29) throw new Error("Invalid driver profile");
  const decipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
}

export function prepareDriverPrivate(idNumber: string, photoBase64: string) {
  const id = idNumber.trim();
  if (id.length < 4 || id.length > 64 || /[\r\n\x00-\x1f]/.test(id)) throw new Error("Enter a valid driver ID number (4–64 characters).");
  if (!photoBase64 || photoBase64.length > 2_800_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(photoBase64)) {
    throw new Error("Choose a JPEG, PNG or WebP profile photo under 2 MB.");
  }
  const bytes = Buffer.from(photoBase64, "base64");
  if (bytes.length < 32 || bytes.length > MAX_PHOTO_BYTES) throw new Error("Profile photo must be under 2 MB.");
  const mime = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "image/jpeg" :
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "image/png" :
    bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" ? "image/webp" : null;
  if (!mime) throw new Error("Only JPEG, PNG and WebP photos are accepted.");
  return { idCiphertext: encrypt(Buffer.from(id, "utf8")), idLast4: id.slice(-4), photoCiphertext: encrypt(bytes), photoMimeType: mime };
}

export async function getDriverPortrait(profileId: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select({ photoCiphertext: driverPrivateProfiles.photoCiphertext, photoMimeType: driverPrivateProfiles.photoMimeType })
    .from(driverPrivateProfiles).where(eq(driverPrivateProfiles.profileId, profileId)).limit(1);
  if (!row) return null;
  return { bytes: decrypt(row.photoCiphertext), mimeType: row.photoMimeType };
}
