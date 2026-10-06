import "dotenv/config";
import { and, eq, isNull, sql } from "drizzle-orm";
import { adminSetupInvites, memberCredentials, users } from "../drizzle/schema";
import { getDb } from "../server/db";
import { insertId } from "../server/lib/mysql";
import { ADMIN_SETUP_MS, createAdminResetToken } from "../server/services/admin-auth";
import { normalizeMemberEmail } from "../server/services/member-auth";

// Operator-only: no public reset-link endpoint exists. Every target is explicit.
// The raw link is delivered to the verified project owner, never printed to logs.
const PREVIEW_ORIGIN = "https://8328-ip1nxp76g4ol7r5z117o1-dd2b4445.us1.manus.computer";

async function main() {
  const requestedEmail = process.argv[2];
  if (process.argv.length !== 3 || !requestedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedEmail)) {
    throw new Error("Pass the exact administrator email to reset as the single argument");
  }
  const email = normalizeMemberEmail(requestedEmail);
  const db = await getDb();
  if (!db) throw new Error("Managed database is unavailable");
  if (!process.env.MANUS_API_URL || !process.env.MANUS_API_KEY) {
    throw new Error("The project-owner notification service is unavailable");
  }
  const [admin] = await db.select({ id: users.id, email: users.email, role: users.role }).from(users)
    .where(sql`LOWER(${users.email}) = ${email}`).limit(1);
  if (admin?.role !== "admin" || !admin.email || normalizeMemberEmail(admin.email) !== email) {
    throw new Error("The specified email is not an administrator; no reset link sent");
  }
  const { token, hash } = createAdminResetToken();
  const id = await db.transaction(async tx => {
    const [current] = await tx.select({ role: users.role, email: users.email }).from(users)
      .where(eq(users.id, admin.id)).limit(1).for("update");
    const [credential] = await tx.select({ id: memberCredentials.id, emailNormalized: memberCredentials.emailNormalized }).from(memberCredentials)
      .where(eq(memberCredentials.userId, admin.id)).limit(1).for("update");
    if (current?.role !== "admin" || !current.email || normalizeMemberEmail(current.email) !== email ||
        !credential || credential.emailNormalized !== email) {
      throw new Error("Administrator password or identity changed; no reset link sent");
    }
    // Only links for this administrator are invalidated. Other admins remain signed in.
    await tx.update(adminSetupInvites).set({ expiresAt: new Date() })
      .where(and(eq(adminSetupInvites.userId, admin.id), isNull(adminSetupInvites.consumedAt)));
    const result = await tx.insert(adminSetupInvites).values({
      userId: admin.id, tokenHash: hash, expiresAt: new Date(Date.now() + ADMIN_SETUP_MS),
    });
    return insertId(result);
  });

  // Fragment tokens are not sent in HTTP requests or referrer URLs.
  const link = new URL(`/admin/setup#token=${token}`, PREVIEW_ORIGIN).toString();
  const title = "Metro Pro: private administrator password reset";
  const content = [
    `A password reset was requested for the Metro Pro administrator ${email}.`,
    "Share this one-time private link only with that administrator to choose a new password:",
    link,
    "The link expires after 24 hours and works once. Do not forward it to anyone else or share the password.",
    "Their old password continues to work until reset completes; completing it ends their earlier password sessions. Other administrators are unaffected.",
  ].join("\n\n");

  try {
    const base = process.env.MANUS_API_URL.endsWith("/")
      ? process.env.MANUS_API_URL : `${process.env.MANUS_API_URL}/`;
    const response = await fetch(new URL("webdevtoken.v1.WebDevService/SendNotification", base), {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.MANUS_API_KEY}`,
        "content-type": "application/json",
        "connect-protocol-version": "1",
      },
      body: JSON.stringify({ title, content }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || (body && typeof body === "object" && "error" in body)) {
      throw new Error(`Owner notification not accepted (HTTP ${response.status})`);
    }
    console.log("Owner-only admin reset notification accepted; a one-time 24-hour link was issued. No token was printed.");
  } catch (error) {
    await db.update(adminSetupInvites).set({ expiresAt: new Date() })
      .where(eq(adminSetupInvites.id, id));
    throw error;
  }
}

main().then(() => process.exit(0)).catch(error => {
  console.error("Admin reset link not sent:", error instanceof Error ? error.message : "unknown error");
  process.exit(1);
});
