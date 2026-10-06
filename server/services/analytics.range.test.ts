import { describe, expect, it } from "vitest";
import { analyticsDateRange, averagePaidSeatCents } from "./analytics";

describe("New York operations analytics", () => {
  it("uses 23-hour and 25-hour local days when clocks change", () => {
    const spring = analyticsDateRange({ period: "today" }, new Date("2026-03-08T12:00:00Z"));
    expect(spring).toEqual({ start: new Date("2026-03-08T05:00:00Z"), end: new Date("2026-03-09T04:00:00Z") });
    const fall = analyticsDateRange({ period: "today" }, new Date("2026-11-01T12:00:00Z"));
    expect(fall).toEqual({ start: new Date("2026-11-01T04:00:00Z"), end: new Date("2026-11-02T05:00:00Z") });
  });
  it("starts This week on Monday across the fall clock change", () => {
    expect(analyticsDateRange({ period: "week" }, new Date("2026-10-06T12:00:00Z")))
      .toEqual({ start: new Date("2026-10-05T04:00:00Z"), end: new Date("2026-10-07T04:00:00Z") });
    expect(analyticsDateRange({ period: "week" }, new Date("2026-11-01T12:00:00Z")))
      .toEqual({ start: new Date("2026-10-26T04:00:00Z"), end: new Date("2026-11-02T05:00:00Z") });
  });
  it("excludes reversed, impossible and overly long custom date ranges", () => {
    expect(() => analyticsDateRange({ period: "custom", from: "2026-10-09", to: "2026-10-08" })).toThrow(RangeError);
    expect(() => analyticsDateRange({ period: "custom", from: "2026-02-30", to: "2026-03-01" })).toThrow(RangeError);
    expect(() => analyticsDateRange({ period: "custom", from: "2024-01-01", to: "2026-01-01" })).toThrow(RangeError);
  });
  it("counts one-way and round-trip passengers as individual paid seats", () => {
    expect(averagePaidSeatCents(30000, 2)).toBe(15000);
    expect(averagePaidSeatCents(60000, 4)).toBe(15000);
    expect(averagePaidSeatCents(0, 0)).toBe(0);
  });
});
