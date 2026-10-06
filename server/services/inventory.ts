import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { bookings, departures, passengers, payments, vehicles } from "../../drizzle/schema";
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

type InventoryExecutor = { execute: (query: SQL) => Promise<unknown> };
type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function inventoryTransaction<T>(db: Database, run: (tx: Transaction) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try { return await db.transaction(run); }
    catch (error) {
      const cause = error as { code?: string; errno?: number };
      if (attempt >= 2 || !(cause.code === "ER_LOCK_DEADLOCK" || cause.errno === 1213 ||
        cause.code === "ER_LOCK_WAIT_TIMEOUT" || cause.errno === 1205)) throw error;
      await new Promise(resolve => setTimeout(resolve, 15 * (attempt + 1)));
    }
  }
}

/** Always acquire outbound/return departure locks in ascending ID order.
 * Opposite-direction trips can otherwise deadlock during payment/refund/expiry. */
export async function lockDepartureInventory(tx: Transaction, ids: (number | null)[]) {
  for (const id of [...new Set(ids.filter((value): value is number => value !== null))].sort((a, b) => a - b)) {
    const [trip] = await tx.select({ id: departures.id }).from(departures).where(eq(departures.id, id)).limit(1).for("update");
    if (!trip) throw new Error("Departure inventory is unavailable; transaction rolled back.");
  }
}

async function holdUsing(executor: InventoryExecutor, departureId: number, count: number, frontCount = 0) {
  checkSeatCounts(count, frontCount);
  const result = await executor.execute(sql`
    UPDATE departures
    SET seatsHeld = seatsHeld + ${count}, frontSeatsHeld = frontSeatsHeld + ${frontCount}
    WHERE id = ${departureId}
      AND status IN ('scheduled','boarding','delayed')
      AND departAt > ${new Date()}
      AND capacity - seatsSold - seatsHeld >= ${count}
      AND frontSeatsSold + frontSeatsHeld + ${frontCount} <= 1
      AND capacity - 1 - (seatsSold + seatsHeld - frontSeatsSold - frontSeatsHeld) >= ${count - frontCount}
      AND vehicleId IS NOT NULL AND EXISTS (SELECT 1 FROM vehicles v WHERE v.id = departures.vehicleId
        AND v.status NOT IN ('maintenance', 'out_of_service') AND v.capacity >= departures.capacity)
  `);
  if (!affectedRows(result)) throw new Error("Selected seats are SOLD OUT");
}

export async function holdSeats(departureId: number, count: number, frontCount = 0) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return holdUsing(db, departureId, count, frontCount);
}

export async function holdSeatsInTransaction(executor: InventoryExecutor, departureId: number, count: number, frontCount = 0) {
  return holdUsing(executor, departureId, count, frontCount);
}

async function releaseUsing(executor: InventoryExecutor, departureId: number, count: number, frontCount = 0) {
  await executor.execute(sql`
    UPDATE departures
    SET seatsHeld = GREATEST(seatsHeld - ${count}, 0),
        frontSeatsHeld = GREATEST(frontSeatsHeld - ${frontCount}, 0)
    WHERE id = ${departureId}
  `);
}

export async function releaseHolds(departureId: number, count: number, frontCount = 0) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return releaseUsing(db, departureId, count, frontCount);
}

export async function releaseHoldsInTransaction(executor: InventoryExecutor, departureId: number, count: number, frontCount = 0) {
  return releaseUsing(executor, departureId, count, frontCount);
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
    const didExpire = await inventoryTransaction(db, async tx => {
      const [current] = await tx.select().from(bookings).where(eq(bookings.id, booking.id)).limit(1).for("update");
      if (!current || current.status !== "pending_payment" || !current.holdExpiresAt || current.holdExpiresAt > now) return false;
      await lockDepartureInventory(tx, [current.outboundDepartureId, current.returnDepartureId]);
      const release = async (departureId: number, count: number, frontCount: number) => {
        await tx.execute(sql`
          UPDATE departures SET seatsHeld = GREATEST(seatsHeld - ${count}, 0),
            frontSeatsHeld = GREATEST(frontSeatsHeld - ${frontCount}, 0)
          WHERE id = ${departureId}
        `);
      };
      await release(current.outboundDepartureId, current.passengerCount, current.outboundFrontSeats);
      if (current.returnDepartureId) await release(current.returnDepartureId, current.passengerCount, current.returnFrontSeats);
      await tx.update(passengers).set({ departureId: null, seatNumber: null, returnDepartureId: null, returnSeatNumber: null })
        .where(eq(passengers.bookingId, current.id));
      await tx.update(bookings).set({ status: "canceled", holdExpiresAt: null }).where(eq(bookings.id, current.id));
      await tx.update(payments).set({ status: "failed" }).where(eq(payments.bookingId, current.id));
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
  if (row.departAt <= new Date()) throw new Error("This departure has already started");
  if (!row.vehicleId) throw new Error("This departure needs an assigned vehicle before booking");
  const [van] = await db.select({ status: vehicles.status, capacity: vehicles.capacity })
    .from(vehicles).where(eq(vehicles.id, row.vehicleId)).limit(1);
  if (!van || van.status === "maintenance" || van.status === "out_of_service" || van.capacity < row.capacity) {
    throw new Error("The assigned vehicle is unavailable for this departure");
  }
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
