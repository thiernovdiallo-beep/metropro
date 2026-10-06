import { describe, expect, it } from "vitest";
import { changesBookedItinerary } from "./route-safety";

const route = { originCityId: 1, destinationCityId: 2, pickupLocationId: 3, dropoffLocationId: 4, estimatedMinutes: 540 };
describe("route edit integrity", () => {
  it("does not classify fare/status edits as a rewritten itinerary", () => {
    const fareEdit = { ...route, standardFareCents: 18000, isActive: false };
    expect(changesBookedItinerary(route, fareEdit)).toBe(false);
  });
  it("identifies changed stops, cities and duration individually", () => {
    for (const field of Object.keys(route) as (keyof typeof route)[]) {
      expect(changesBookedItinerary(route, { ...route, [field]: route[field] + 1 })).toBe(true);
    }
  });
});
