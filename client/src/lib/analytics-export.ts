export type AnalyticsReportData = {
  revenueSummary: {
    netRevenueCents: number;
    grossTicketRevenueCents: number;
    membershipRevenueCents: number;
    refundsCents: number;
    confirmedBookings: number;
    paidTicketTransactions: number;
  };
  revenueTrend: Array<{
    date: string;
    grossTicketCents: number;
    membershipCents: number;
    refundsCents: number;
    netRevenueCents: number;
  }>;
  routePerformance: Array<{
    routeId: number;
    trips: number;
    seatsSold: number;
    capacity: number;
    occupancyPercent: number;
    revenueCents: number;
    averageRevenuePerTripCents: number;
  }>;
  revenueByVehicle: Array<{ vehicleId: number; code: string; revenueCents: number }>;
  revenuePerTrip: Array<{ departureId: number; revenueCents: number }>;
  occupancyByDeparture: Array<{
    departureId: number;
    routeId: number;
    departAt: Date;
    occupancyPercent: number;
    band: string;
    seatsSold: number;
    capacity: number;
  }>;
};

function escapeCsv(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function dollars(cents: number) {
  return (cents / 100).toFixed(2);
}

export function analyticsToCsv(data: AnalyticsReportData, periodLabel: string) {
  const rows: Array<Array<string | number>> = [
    ["MetroPro Revenue Reporting", ""],
    ["Period", periodLabel],
    [],
    ["Revenue Summary"],
    ["Metric", "Value"],
    ["Net revenue", dollars(data.revenueSummary.netRevenueCents)],
    ["Gross ticket revenue", dollars(data.revenueSummary.grossTicketRevenueCents)],
    ["Membership revenue", dollars(data.revenueSummary.membershipRevenueCents)],
    ["Successful refunds", dollars(data.revenueSummary.refundsCents)],
    ["Confirmed bookings", data.revenueSummary.confirmedBookings],
    ["Successful ticket payments", data.revenueSummary.paidTicketTransactions],
    [],
    ["Daily Revenue Trend"],
    ["Date", "Ticket gross", "Memberships", "Refunds", "Net revenue"],
    ...data.revenueTrend.map(row => [row.date, dollars(row.grossTicketCents), dollars(row.membershipCents), dollars(row.refundsCents), dollars(row.netRevenueCents)]),
    [],
    ["Route Performance"],
    ["Route ID", "Trips", "Seats sold", "Capacity", "Occupancy %", "Revenue", "Average revenue / trip"],
    ...data.routePerformance.map(row => [row.routeId, row.trips, row.seatsSold, row.capacity, row.occupancyPercent, dollars(row.revenueCents), dollars(row.averageRevenuePerTripCents)]),
    [],
    ["Revenue by Vehicle"],
    ["Vehicle ID", "Vehicle", "Revenue"],
    ...data.revenueByVehicle.map(row => [row.vehicleId, row.code, dollars(row.revenueCents)]),
    [],
    ["Revenue by Trip"],
    ["Departure ID", "Revenue"],
    ...data.revenuePerTrip.map(row => [row.departureId, dollars(row.revenueCents)]),
    [],
    ["Departure Occupancy"],
    ["Departure ID", "Route ID", "Departure", "Seats sold", "Capacity", "Occupancy %", "Band"],
    ...data.occupancyByDeparture.map(row => [row.departureId, row.routeId, row.departAt.toISOString(), row.seatsSold, row.capacity, row.occupancyPercent, row.band]),
  ];
  return rows.map(row => row.map(value => escapeCsv(value ?? "")).join(",")).join("\n") + "\n";
}
