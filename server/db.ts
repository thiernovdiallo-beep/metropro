import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  auditLogs,
  bookings,
  driverProfiles,
  memberships,
  payments,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available");
  }

  const existing = await getUserByOpenId(user.openId);

  const values: InsertUser = {
    openId: user.openId,
    lastSignedIn: user.lastSignedIn ?? new Date(),
  };
  const updateSet: Record<string, unknown> = {
    lastSignedIn: values.lastSignedIn,
  };

  if (user.name !== undefined) {
    values.name = user.name ?? null;
    if (!existing?.name) updateSet.name = user.name ?? null;
  }
  if (user.email !== undefined) {
    values.email = user.email ?? null;
    updateSet.email = user.email ?? null;
  }
  if (user.phone !== undefined) {
    values.phone = user.phone ?? null;
    updateSet.phone = user.phone ?? null;
  }
  if (user.loginMethod !== undefined) {
    values.loginMethod = user.loginMethod ?? null;
    updateSet.loginMethod = user.loginMethod ?? null;
  }

  let role = existing?.role;
  if (!existing) {
    const [adminCount] = await db
      .select({ n: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.role, "admin"));
    if (Number(adminCount?.n ?? 0) === 0 || user.openId === ENV.ownerOpenId) {
      role = "admin";
    } else {
      role = "customer";
    }
    const email = (user.email ?? "").toLowerCase();
    if (email) {
      const [driver] = await db
        .select()
        .from(driverProfiles)
        .where(eq(driverProfiles.email, email))
        .limit(1);
      if (driver && driver.status === "active") {
        role = "driver";
      }
    }
    values.role = role;
  }

  await db.insert(users).values(values).onDuplicateKeyUpdate({
    set: updateSet,
  });

  const saved = await getUserByOpenId(user.openId);
  if (saved?.email && saved.role === "driver") {
    await db
      .update(driverProfiles)
      .set({ userId: saved.id })
      .where(eq(driverProfiles.email, saved.email.toLowerCase()));
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row;
}

export async function getActiveMembership(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.status, "active")))
    .limit(1);
  return row && (!row.currentPeriodEnd || row.currentPeriodEnd > new Date()) ? row : undefined;
}

export async function writeAudit(
  actorUserId: number | null,
  action: string,
  entityType: string,
  entityId: string | number,
  metadata?: Record<string, unknown>
) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLogs).values({
    actorUserId,
    action,
    entityType,
    entityId: String(entityId),
    metadata: metadata ?? null,
  });
}

export async function listUserPayments(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(payments)
    .where(eq(payments.userId, userId))
    .orderBy(desc(payments.createdAt));
}

export async function listUserBookings(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(bookings)
    .where(eq(bookings.userId, userId))
    .orderBy(desc(bookings.createdAt));
}

export { and, desc, eq, gte, lte, sql };
