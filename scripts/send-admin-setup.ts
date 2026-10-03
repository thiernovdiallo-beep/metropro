import "dotenv/config";
import { eq, and, isNull } from "drizzle-orm";
import { adminSetupInvites, memberCredentials, users } from "../drizzle/schema";
import { getDb } from "../server/db";
import { insertId } from "../server/lib/mysql";
import { ADMIN_SETUP_MS, createAdminSetupToken } from "../server/services/admin-auth";

// This operator command is deliberately not exposed as a public API endpoint.
// Run only after the admin-password update is checkpointed and the project owner
// has approved sending a private link to set the EXISTING administrator's password.
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
    throw new Error("Expected exactly one existing administrator with an email; no invitation sent");
  }
  const admin = admins[0];
  const existing = await db.select({ id: memberCredentials.id }).from(memberCredentials)
    .where(eq(memberCredentials.userId, admin.id)).limit(1);
  if (existing.length) throw new Error("The administrator already has a password; no invitation sent");

  const { token, hash } = createAdminSetupToken();
  const expiry = new Date(Date.now() + ADMIN_SETUP_MS);
  const id = await db.transaction(async tx => {
    const [current] = await tx.select({ id: users.id, role: users.role, email: users.email })
      .from(users).where(eq(users.id, admin.id)).limit(1).for("update");
    if (current?.role !== "admin" || !current.email) throw new Error("Administrator changed; no invitation sent");
    const [credential] = await tx.select({ id: memberCredentials.id }).from(memberCredentials)
      .where(eq(memberCredentials.userId, admin.id)).limit(1);
    if (credential) throw new Error("Administrator password already configured; no invitation sent");
    // Reissuing the invitation immediately invalidates any previous link.
    await tx.update(adminSetupInvites).set({ expiresAt: new Date() })
      .where(and(eq(adminSetupInvites.userId, admin.id), isNull(adminSetupInvites.consumedAt)));
    const result = await tx.insert(adminSetupInvites)
      .values({ userId: admin.id, tokenHash: hash, expiresAt: expiry });
    return insertId(result);
  });
  const link = new URL(`/admin/setup#token=${token}`, PREVIEW_ORIGIN).toString();
  const title = "Metro Pro: private administrator password setup";
  const content = [
    `A password login was requested for the existing Metro Pro administrator (${admin.email}).`,
    "Open this private one-time link in the Metro Pro Preview to choose a password:",
    link,
    "This link expires after 24 hours and works only once. Do not forward it or share your password.",
    "If you did not request admin password access, ignore this notice. Existing Apple login is unchanged.",
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
    console.log("Owner-only admin setup notification accepted; a one-time 24-hour link was issued. No token was printed.");
  } catch (error) {
    await db.update(adminSetupInvites).set({ expiresAt: new Date() })
      .where(eq(adminSetupInvites.id, id));
    throw error;
  }
}

main().then(() => process.exit(0)).catch(error => {
  console.error("Admin invitation not sent:", error instanceof Error ? error.message : "unknown error");
  process.exit(1);
});
