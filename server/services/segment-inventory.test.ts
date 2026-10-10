import { describe, expect, it } from "vitest";
import { segmentAvailability, segmentDemand, type SegmentInventoryRow } from "./segment-inventory";

const segments = [
  { id: 1, departureId: 10, segmentOrder: 0, fromLocationId: 100, toLocationId: 200, capacity: 11, seatsSold: 3, seatsHeld: 2, createdAt: new Date(), updatedAt: new Date() },
  { id: 2, departureId: 10, segmentOrder: 1, fromLocationId: 200, toLocationId: 300, capacity: 11, seatsSold: 5, seatsHeld: 1, createdAt: new Date(), updatedAt: new Date() },
  { id: 3, departureId: 10, segmentOrder: 2, fromLocationId: 300, toLocationId: 400, capacity: 11, seatsSold: 2, seatsHeld: 0, createdAt: new Date(), updatedAt: new Date() },
] satisfies SegmentInventoryRow[];

describe("segment inventory demand", () => {
  it("counts a full-route passenger on every segment", () => {
    expect([...segmentDemand(segments, [{}], "outbound").entries()]).toEqual([[1, 1], [2, 1], [3, 1]]);
  });

  it("counts only the segments covered by an intermediate-stop journey", () => {
    expect([...segmentDemand(segments, [{ outboundPickupLocationId: 200, outboundDropoffLocationId: 400 }], "outbound").entries()]).toEqual([[2, 1], [3, 1]]);
  });

  it("supports return-leg location fields", () => {
    expect([...segmentDemand(segments, [{ returnPickupLocationId: 100, returnDropoffLocationId: 300 }], "return").entries()]).toEqual([[1, 1], [2, 1]]);
  });

  it("rejects a journey whose pickup is after its drop-off", () => {
    expect(() => segmentDemand(segments, [{ outboundPickupLocationId: 300, outboundDropoffLocationId: 200 }], "outbound"))
      .toThrow("not valid");
  });

  it("calculates remaining segment capacity", () => {
    expect(segmentAvailability(segments[0])).toBe(6);
  });
});
