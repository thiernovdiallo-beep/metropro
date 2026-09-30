import { and, eq, ne, or, sql } from "drizzle-orm";
import { departures, vehicles } from "../../drizzle/schema";
import { getDb } from "../db";

export async function vehicleHasOverlap(
  vehicleId: number,
  start: Date,
  end: Date,
  excludeDepartureId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db
    .select({ id: departures.id })
    .from(departures)
    .where(
      and(
        eq(departures.vehicleId, vehicleId),
        ne(departures.status, "canceled"),
        excludeDepartureId ? ne(departures.id, excludeDepartureId) : sql`1=1`,
        sql`${departures.departAt} < ${end} AND ${departures.arriveAt} > ${start}`
      )
    )
    .limit(1);
  return rows.length > 0;
}

export async function assertVehicleAssignable(
  vehicleId: number,
  start: Date,
  end: Date,
  excludeDepartureId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1);
  if (!vehicle) throw new Error("Vehicle not found");
  if (vehicle.status === "out_of_service" || vehicle.status === "maintenance") {
    throw new Error("Vehicle is not available");
  }
  if (await vehicleHasOverlap(vehicleId, start, end, excludeDepartureId)) {
    throw new Error("Vehicle is already assigned to an overlapping trip");
  }
  return vehicle;
}

export async function setVehicleStatus(
  vehicleId: number,
  status: "available" | "assigned" | "in_transit" | "maintenance" | "out_of_service"
) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(vehicles).set({ status }).where(eq(vehicles.id, vehicleId));
}

export { and, eq, or };
