import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { departures, routes } from "../../drizzle/schema";
import { getDb } from "../db";
import { insertId } from "../lib/mysql";
import { lockDepartureInventory } from "./inventory";

const integration = process.env.METROPRO_DB_INTEGRATION_TEST === "1" ? describe : describe.skip;
integration("inverse-order round-trip inventory updates on real MySQL", () => {
  it("serializes opposite itinerary orders without a deadlock or lost counter updates", async () => {
    const db = await getDb();
    if (!db) throw new Error("Integration database is unavailable");
    const [route] = await db.select({ id: routes.id }).from(routes).limit(1);
    if (!route) throw new Error("A real route is required for synthetic departure rows");
    const ids: number[] = [];
    try {
      for (let i = 0; i < 2; i += 1) {
        const result = await db.insert(departures).values({ routeId: route.id, vehicleId: null,
          departAt: new Date(Date.UTC(2031, 0, i + 5)), arriveAt: new Date(Date.UTC(2031, 0, i + 5, 12)),
          status: "canceled", capacity: 10 });
        ids.push(insertId(result));
      }
      await Promise.all(Array.from({ length: 4 }, (_, index) => db.transaction(async tx => {
        await lockDepartureInventory(tx, index % 2 ? [ids[1], ids[0]] : [ids[0], ids[1]]);
        for (const id of index % 2 ? [ids[1], ids[0]] : ids) {
          await tx.update(departures).set({ seatsHeld: sql`${departures.seatsHeld} + 1` }).where(eq(departures.id, id));
        }
      })));
      for (const id of ids) {
        const [row] = await db.select({ seatsHeld: departures.seatsHeld }).from(departures).where(eq(departures.id, id)).limit(1);
        expect(row?.seatsHeld).toBe(4);
      }
    } finally {
      for (const id of ids) await db.delete(departures).where(eq(departures.id, id));
    }
  }, 20_000);
});
