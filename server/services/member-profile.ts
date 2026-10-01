import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { memberIdPhotos, users } from "../../drizzle/schema";
import { getDb } from "../db";

export const MAX_ID_PHOTO_BYTES = 2 * 1024 * 1024;

function encryptionKey() {
  const secret = process.env.MANUS_JWT_SECRET;
  const project = process.env.MANUS_PROJECT_ID;
  if (!secret || !project) throw new Error("Private ID storage is not configured");
  return Buffer.from(hkdfSync("sha256", Buffer.from(secret), Buffer.from(project), Buffer.from("metropro/private-id-photo/v1"), 32));
}

function imageMime(bytes: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export function encryptMemberIdImage(base64: string) {
  if (!base64 || base64.length > 2_800_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new Error("Choose a JPEG, PNG or WebP ID photo under 2 MB.");
  }
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length < 32 || bytes.length > MAX_ID_PHOTO_BYTES) throw new Error("The ID photo must be under 2 MB.");
  const mimeType = imageMime(bytes);
  if (!mimeType) throw new Error("Only JPEG, PNG and WebP ID photos are accepted.");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce);
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  const ciphertext = Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString("base64");
  return { ciphertext, mimeType };
}

export function decryptMemberIdImage(ciphertext: string) {
  const payload = Buffer.from(ciphertext, "base64");
  if (payload.length < 29) throw new Error("Invalid stored ID photo");
  const nonce = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

export async function saveMemberIdPhoto(userId: number, base64: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const image = encryptMemberIdImage(base64);
  const uploadedAt = new Date();
  await db.insert(memberIdPhotos).values({ userId, ...image, uploadedAt }).onDuplicateKeyUpdate({
    set: { ...image, uploadedAt },
  });
  return { uploadedAt, mimeType: image.mimeType };
}

export async function getMemberIdPhoto(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(memberIdPhotos).where(eq(memberIdPhotos.userId, userId)).limit(1);
  if (!row) return null;
  return { bytes: decryptMemberIdImage(row.ciphertext), mimeType: row.mimeType };
}

export async function getMemberProfileStatus(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("Member account not found");
  const [photo] = await db.select({ uploadedAt: memberIdPhotos.uploadedAt }).from(memberIdPhotos)
    .where(eq(memberIdPhotos.userId, userId)).limit(1);
  const name = user.name?.trim() ?? "";
  const email = user.email?.trim() ?? "";
  const phone = user.phone?.trim() ?? "";
  return {
    name,
    email,
    phone,
    idPhotoUploadedAt: photo?.uploadedAt ?? null,
    complete: name.split(/\s+/).length >= 2 && /^\S+@\S+\.\S+$/.test(email) && phone.replace(/\D/g, "").length >= 7 && Boolean(photo),
  };
}
