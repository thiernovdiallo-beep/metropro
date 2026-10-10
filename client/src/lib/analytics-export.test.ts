import { describe, expect, it } from "vitest";
import { analyticsToCsv } from "./analytics-export";

describe("analytics CSV export", () => {
  it("includes revenue sections and escapes comma-containing labels", () => {
    const csv = analyticsToCsv({
      revenueSummary: {
        netRevenueCents: 12500,
        grossTicketRevenueCents: 15000,
        membershipRevenueCents: 2500,
        refundsCents: 5000,
        confirmedBookings: 2,
        paidTicketTransactions: 1,
      },
      revenueTrend: [{ date: "2026-10-10", grossTicketCents: 15000, membershipCents: 2500, refundsCents: 5000, netRevenueCents: 12500 }],
      routePerformance: [{ routeId: 1, trips: 2, seatsSold: 8, capacity: 22, occupancyPercent: 36, revenueCents: 15000, averageRevenuePerTripCents: 7500 }],
      revenueByVehicle: [{ vehicleId: 1, code: "MP-001, East", revenueCents: 15000 }],
      revenuePerTrip: [{ departureId: 4, revenueCents: 15000 }],
      occupancyByDeparture: [{ departureId: 4, routeId: 1, departAt: new Date("2026-10-10T12:00:00Z"), occupancyPercent: 36, band: "under_70", seatsSold: 8, capacity: 22 }],
    }, "This month");

    expect(csv).toContain("MetroPro Revenue Reporting,\n");
    expect(csv).toContain("Period,This month\n");
    expect(csv).toContain("Net revenue,125.00\n");
    expect(csv).toContain('1,"MP-001, East",150.00');
    expect(csv).toContain("Daily Revenue Trend\n");
    expect(csv.endsWith("\n")).toBe(true);
  });
});
