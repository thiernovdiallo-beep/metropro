import { and, eq, inArray, sql } from "drizzle-orm";
import { bookings, departures } from "../../drizzle/schema";
import { getDb } from "../db";
import { affectedRows } from "../lib/mysql";

const BOOKABLE = ["scheduled", "boarding", "delayed"] as const;

type Inventory = Pick<
  typeof departures.$inferSelect,
  "capacity" | "seatsSold" | "seatsHeld" | "frontSeatsSold" | "frontSeatsHeld"
>;

export function remainingSeats(capacity: number, sold: number, held: number) {
  return Math.max(0, capacity - sold - held);
}

export function seatAvailability(row: Inventory) {
  const frontCapacity = row.capacity > 0 ? 1 : 0;
  const occupiedFront = row.frontSeatsSold + row.frontSeatsHeld;
  const occupiedStandard = row.seatsSold + row.seatsHeld - occupiedFront;
  return {
    front: Math.max(0, frontCapacity - occupiedFront),
    standard: Math.max(0, row.capacity - frontCapacity - occupiedStandard),
  };
}

function checkSeatCounts(count: number, frontCount: number) {
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(frontCount) || frontCount < 0 || frontCount > 1 || frontCount > count) {
    throw new Error("Invalid seat selection");
  }
}

export async function holdSeats(departureId: number, count: number, frontCount = 0) {
  checkSeatCounts(count, frontCount);
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.execute(sql`
    UPDATE departures
    SET seatsHeld = seatsHeld + ${count}, frontSeatsHeld = frontSeatsHeld + ${frontCount}
    WHERE id = ${departureId}
      AND status IN ('scheduled','boarding','delayed')
      AND capacity - seatsSold - seatsHeld >= ${count}
      AND frontSeatsSold + frontSeatsHeld + ${frontCount} <= 1
      AND capacity - 1 - (seatsSold + seatsHeld - frontSeatsSold - frontSeatsHeld) >= ${count - frontCount}
  `);
  if (!affectedRows(result)) throw new Error("Selected seats are SOLD OUT");
}

export async function releaseHolds(departureId: number, count: number, frontCount = 0) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.execute(sql`
    UPDATE departures
    SET seatsHeld = GREATEST(seatsHeld - ${count}, 0),
        frontSeatsHeld = GREATEST(frontSeatsHeld - ${frontCount}, 0)
    WHERE id = ${departureId}
  `);
}

export async function convertHoldsToSold(departureId: number, count: number, frontCount = 0) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.execute(sql`
    UPDATE departures
    SET seatsHeld = seatsHeld - ${count},
        frontSeatsHeld = frontSeatsHeld - ${frontCount},
        seatsSold = seatsSold + ${count},
        frontSeatsSold = frontSeatsSold + ${frontCount}
    WHERE id = ${departureId} AND seatsHeld >= ${count} AND frontSeatsHeld >= ${frontCount}
  `);
  if (!affectedRows(result)) throw new Error("The seat hold has expired; contact support before boarding.");
}

export async function restoreSoldSeats(departureId: number, count: number, frontCount = 0) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.execute(sql`
    UPDATE departures
    SET seatsSold = GREATEST(seatsSold - ${count}, 0),
        frontSeatsSold = GREATEST(frontSeatsSold - ${frontCount}, 0)
    WHERE id = ${departureId}
  `);
}

export async function expireHoldsForBooking(
  departureIds: number[],
  passengerCount: number,
  frontCounts: number[] = []
) {
  for (const [index, id] of departureIds.entries()) {
    await releaseHolds(id, passengerCount, frontCounts[index] ?? 0);
  }
}

export async function expireStaleHolds(now = new Date()) {
  const db = await getDb();
  if (!db) return { expired: 0 };
  const stale = await db.select().from(bookings).where(eq(bookings.status, "pending_payment"));
  let expired = 0;
  for (const booking of stale) {
    if (!booking.holdExpiresAt || booking.holdExpiresAt > now) continue;
    const didExpire = await db.transaction(async tx => {
      const [current] = await tx.select().from(bookings).where(eq(bookings.id, booking.id)).limit(1).for("update");
      if (!current || current.status !== "pending_payment" || !current.holdExpiresAt || current.holdExpiresAt > now) return false;
      const release = async (departureId: number, count: number, frontCount: number) => {
        await tx.execute(sql`
          UPDATE departures SET seatsHeld = GREATEST(seatsHeld - ${count}, 0),
            frontSeatsHeld = GREATEST(frontSeatsHeld - ${frontCount}, 0)
          WHERE id = ${departureId}
        `);
      };
      await release(current.outboundDepartureId, current.passengerCount, current.outboundFrontSeats);
      if (current.returnDepartureId) await release(current.returnDepartureId, current.passengerCount, current.returnFrontSeats);
      await tx.update(bookings).set({ status: "canceled", holdExpiresAt: null }).where(eq(bookings.id, current.id));
      return true;
    });
    if (didExpire) expired += 1;
  }
  return { expired };
}

export async function assertBookable(departureId: number, count: number, isMember: boolean, frontCount = 0) {
  checkSeatCounts(count, frontCount);
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [row] = await db.select().from(departures).where(eq(departures.id, departureId)).limit(1);
  if (!row) throw new Error("Departure not found");
  if (!BOOKABLE.includes(row.status as (typeof BOOKABLE)[number])) throw new Error("This departure is not available");
  if (row.memberEarlyAccessAt && row.memberEarlyAccessAt > new Date() && !isMember) {
    throw new Error("This departure is in member early access");
  }
  const available = seatAvailability(row);
  if (available.front < frontCount || available.standard < count - frontCount) {
    throw new Error("Selected seats are SOLD OUT");
  }
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
