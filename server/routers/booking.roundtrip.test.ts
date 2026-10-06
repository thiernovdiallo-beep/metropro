import { describe, expect, it } from "vitest";
import { requireReversedRoute } from "./booking";

type Trip = Parameters<typeof requireReversedRoute>[0];
const trip = (from: number, to: number, depart: string, arrive: string): Trip => ({
  route: { originCityId: from, destinationCityId: to },
  departAt: new Date(depart), arriveAt: new Date(arrive),
} as Trip);

describe("round-trip booking chronology", () => {
  const outbound = trip(1, 2, "2026-10-07T12:00:00Z", "2026-10-07T21:00:00Z");
  it("accepts a return after arrival or no return at all", () => {
    expect(() => requireReversedRoute(outbound, trip(2, 1, "2026-10-07T21:01:00Z", "2026-10-08T06:00:00Z"))).not.toThrow();
    expect(() => requireReversedRoute(outbound, null)).not.toThrow();
  });
  it("rejects return trips before or exactly at outbound arrival, even on the same date", () => {
    for (const time of ["2026-10-07T20:30:00Z", "2026-10-07T21:00:00Z"]) {
      expect(() => requireReversedRoute(outbound, trip(2, 1, time, "2026-10-08T06:00:00Z")))
        .toThrow(/after the outbound trip arrives/i);
    }
  });
  it("still rejects non-reversed routes", () => {
    expect(() => requireReversedRoute(outbound, trip(1, 2, "2026-10-08T12:00:00Z", "2026-10-08T21:00:00Z")))
      .toThrow(/reverse the outbound route/i);
  });
});
