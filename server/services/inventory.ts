import { and, eq, inArray, sql } from "drizzle-orm";
import { bookings, departures } from "../../drizzle/schema";
import { getDb } from "../db";
import { affectedRows } from "../lib/mysql";

const BOOKABLE = ["scheduled", "boarding", "delayed"] as const;

export function remainingSeats(capacity: number, sold: number, held: number) {
  return Math.max(0, capacity - sold - held);
}

export async function holdSeats(departureId: number, count: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.execute(sql`
    UPDATE departures
    SET seatsHeld = seatsHeld + ${count}
    WHERE id = ${departureId}
      AND status IN ('scheduled','boarding','delayed')
      AND capacity - seatsSold - seatsHeld >= ${count}
  `);
  const affected = affectedRows(result);
  if (!affected) {
    throw new Error("SOLD OUT");
  }
}

export async function releaseHolds(departureId: number, count: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.execute(sql`
    UPDATE departures
    SET seatsHeld = GREATEST(seatsHeld - ${count}, 0)
    WHERE id = ${departureId}
  `);
}

export async function convertHoldsToSold(departureId: number, count: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.execute(sql`
    UPDATE departures
    SET seatsHeld = GREATEST(seatsHeld - ${count}, 0),
        seatsSold = seatsSold + ${count}
    WHERE id = ${departureId}
  `);
}

export async function restoreSoldSeats(departureId: number, count: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.execute(sql`
    UPDATE departures
    SET seatsSold = GREATEST(seatsSold - ${count}, 0)
    WHERE id = ${departureId}
  `);
}

export async function expireHoldsForBooking(
  departureIds: number[],
  passengerCount: number
) {
  for (const id of departureIds) {
    await releaseHolds(id, passengerCount);
  }
}

export async function expireStaleHolds(now = new Date()) {
  const db = await getDb();
  if (!db) return { expired: 0 };
  const stale = await db
    .select()
    .from(bookings)
    .where(eq(bookings.status, "pending_payment"));
  let expired = 0;
  for (const booking of stale) {
    if (!booking.holdExpiresAt || booking.holdExpiresAt > now) continue;
    await releaseHolds(booking.outboundDepartureId, booking.passengerCount);
    if (booking.returnDepartureId) {
      await releaseHolds(booking.returnDepartureId, booking.passengerCount);
    }
    await db
      .update(bookings)
      .set({ status: "canceled", holdExpiresAt: null })
      .where(eq(bookings.id, booking.id));
    expired += 1;
  }
  return { expired };
}

export async function assertBookable(departureId: number, count: number, isMember: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [row] = await db.select().from(departures).where(eq(departures.id, departureId)).limit(1);
  if (!row) throw new Error("Departure not found");
  if (!BOOKABLE.includes(row.status as (typeof BOOKABLE)[number])) {
    throw new Error("This departure is not available");
  }
  if (row.memberEarlyAccessAt && row.memberEarlyAccessAt > new Date() && !isMember) {
    throw new Error("This departure is in member early access");
  }
  const left = remainingSeats(row.capacity, row.seatsSold, row.seatsHeld);
  if (left < count) throw new Error("SOLD OUT");
  return row;
}

export async function getDeparture(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [row] = await db.select().from(departures).where(eq(departures.id, id)).limit(1);
  return row;
}

export async function getDeparturesByIds(ids: number[]) {
  if (ids.length === 0) return [];
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(departures).where(inArray(departures.id, ids));
}

export { and, eq };
