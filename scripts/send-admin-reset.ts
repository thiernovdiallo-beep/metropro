import "dotenv/config";
import { and, eq, isNull } from "drizzle-orm";
import { adminSetupInvites, memberCredentials, users } from "../drizzle/schema";
import { getDb } from "../server/db";
import { insertId } from "../server/lib/mysql";
import { ADMIN_SETUP_MS, createAdminResetToken } from "../server/services/admin-auth";
import { normalizeMemberEmail } from "../server/services/member-auth";

// Operator-only command; there is deliberately no public reset-link endpoint.
// Send only to the verified Manus project owner after an explicit request.
const PREVIEW_ORIGIN = "https://8328-ip1nxp76g4ol7r5z117o1-dd2b4445.us1.manus.computer";

async function main() {
  const db = await getDb();
  if (!db) throw new Error("Managed database is unavailable");
  if (!process.env.MANUS_API_URL || !process.env.MANUS_API_KEY) {
    throw new Error("The project-owner notification service is unavailable");
  }
  const admins = await db.select({ id: users.id, email: users.email }).from(users)
    .where(eq(users.role, "admin"));
  if (admins.length !== 1 || !admins[0].email) {
    throw new Error("Expected exactly one existing administrator with an email; no reset link sent");
  }
  const admin = admins[0];
  const { token, hash } = createAdminResetToken();
  const id = await db.transaction(async tx => {
    const [current] = await tx.select({ id: users.id, role: users.role, email: users.email })
      .from(users).where(eq(users.id, admin.id)).limit(1).for("update");
    const activeAdmins = await tx.select({ id: users.id }).from(users)
      .where(eq(users.role, "admin")).for("update");
    const [credential] = await tx.select({ id: memberCredentials.id, emailNormalized: memberCredentials.emailNormalized }).from(memberCredentials)
      .where(eq(memberCredentials.userId, admin.id)).limit(1).for("update");
    if (current?.role !== "admin" || !current.email || current.email !== admin.email || activeAdmins.length !== 1 ||
        activeAdmins[0].id !== current.id || !credential ||
        credential.emailNormalized !== normalizeMemberEmail(current.email)) {
      throw new Error("Administrator password or identity changed; no reset link sent");
    }
    // Reissuing a reset link invalidates all earlier unconsumed admin links.
    await tx.update(adminSetupInvites).set({ expiresAt: new Date() })
      .where(and(eq(adminSetupInvites.userId, admin.id), isNull(adminSetupInvites.consumedAt)));
    const result = await tx.insert(adminSetupInvites).values({
      userId: admin.id, tokenHash: hash, expiresAt: new Date(Date.now() + ADMIN_SETUP_MS),
    });
    return insertId(result);
  });

  // A fragment keeps the private token out of HTTP requests and referrer URLs.
  const link = new URL(`/admin/setup#token=${token}`, PREVIEW_ORIGIN).toString();
  const title = "Metro Pro: private administrator password reset";
  const content = [
    `A password reset was requested for the existing Metro Pro administrator (${admin.email}).`,
    "Open this private one-time link in Metro Pro Preview to choose your new password:",
    link,
    "This link expires after 24 hours and works only once. Do not forward it or share your password.",
    "Your current password continues to work until you complete the reset. Saving the new password ends previous password-based admin sessions; Apple sign-in is unchanged.",
    "If you did not request this reset, ignore this notice and contact the project owner.",
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
