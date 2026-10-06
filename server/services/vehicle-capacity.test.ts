import { describe, expect, it } from "vitest";
import { planVehicleCapacityRetune } from "./vehicle-capacity";

const now = new Date("2026-10-06T15:00:00Z");
const future = new Date("2026-11-06T15:00:00Z");

const booked = { id: 1, capacity: 10, departAt: future, status: "scheduled", seatsSold: 1, seatsHeld: 0 };
const empty = { id: 2, capacity: 10, departAt: future, status: "scheduled", seatsSold: 0, seatsHeld: 0 };
const held = { id: 3, capacity: 10, departAt: future, status: "scheduled", seatsSold: 0, seatsHeld: 1 };

describe("vehicle passenger-capacity retuning", () => {
  it("expands only empty scheduled trips from 10 to 11; historical booked and held maps remain 10", () => {
    expect(planVehicleCapacityRetune([booked, empty, held], 11, now)).toEqual([2]);
  });

  it("does not retune past or active trips and ignores canceled departures", () => {
    expect(planVehicleCapacityRetune([
      { ...empty, id: 4, departAt: new Date("2026-09-01T00:00:00Z") },
      { ...booked, id: 5, status: "boarding" },
      { ...empty, id: 6, status: "canceled" },
    ], 11, now)).toEqual([]);
  });

  it("rejects a reduction below any occupied or active trip's original seat capacity", () => {
    expect(() => planVehicleCapacityRetune([booked, empty], 9, now)).toThrow("booked or active");
    expect(() => planVehicleCapacityRetune([held], 9, now)).toThrow("booked or active");
  });
});
