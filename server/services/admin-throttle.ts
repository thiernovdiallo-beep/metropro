import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { eq, lt, sql } from "drizzle-orm";
import { adminLoginThrottle } from "../../drizzle/schema";
import type { getDb } from "../db";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
const WINDOW_MS = 5 * 60 * 1000;
const DENIED = "Could not sign in. Check your credentials or try again later.";
const MAX_ACTIVE_HASHES = 2;
const MAX_WAITERS = 8;
let activeHashes = 0;
const waiters: Array<() => void> = [];

function key(scope: string, value: string) {
  return createHash("sha256").update(`${scope}:${value}`, "utf8").digest("hex");
}

// Counts are recorded BEFORE scrypt, including guesses for nonexistent users.
// The global key prevents cycling through new email/IP values to exhaust CPU.
// The account window is short rather than a persistent attacker-resettable
// lock on the real administrator's credential record.
export async function throttleStaffAttempt(db: Database, source: string, email: string, staffRole: "admin" | "driver") {
  const now = new Date();
  const windows: Array<[string, number]> = [
    [key("all", staffRole), 120],
    [key(`source:${staffRole}`, source || "unknown"), 30],
    [key(`email:${staffRole}`, email), 8],
  ];
  await db.transaction(async tx => {
    for (const [rateKey, limit] of windows) {
      await tx.insert(adminLoginThrottle).values({
        rateKey, attempts: 0, windowEndsAt: new Date(now.getTime() + WINDOW_MS),
      }).onDuplicateKeyUpdate({ set: { attempts: sql`${adminLoginThrottle.attempts}` } });
      const [row] = await tx.select().from(adminLoginThrottle)
        .where(eq(adminLoginThrottle.rateKey, rateKey)).limit(1).for("update");
      if (!row) throw new Error("Admin login throttle unavailable");
      if (row.windowEndsAt <= now) {
        await tx.update(adminLoginThrottle).set({ attempts: 1, windowEndsAt: new Date(now.getTime() + WINDOW_MS) })
          .where(eq(adminLoginThrottle.rateKey, rateKey));
      } else if (row.attempts >= limit) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: DENIED });
      } else {
        await tx.update(adminLoginThrottle).set({ attempts: row.attempts + 1 })
          .where(eq(adminLoginThrottle.rateKey, rateKey));
      }
    }
  });
  // Retain only recent counters; this does not affect the current transaction.
  if (Math.random() < 0.01) {
    await db.delete(adminLoginThrottle)
      .where(lt(adminLoginThrottle.windowEndsAt, new Date(Date.now() - 24 * 60 * 60 * 1000)))
      .catch(() => undefined);
  }
}

export function throttleAdminAttempt(db: Database, source: string, email: string) {
  return throttleStaffAttempt(db, source, email, "admin");
}

// A few independently rate-limited requests can still arrive together. Keep
// scrypt's memory cost bounded per application process without a large queue.
export async function withAdminHashSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (activeHashes < MAX_ACTIVE_HASHES) activeHashes++;
  else {
    if (waiters.length >= MAX_WAITERS) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: DENIED });
    }
    await new Promise<void>(resolve => waiters.push(resolve));
  }
  try {
    return await fn();
  } finally {
    const next = waiters.shift();
    if (next) next();
    else activeHashes--;
  }
}
