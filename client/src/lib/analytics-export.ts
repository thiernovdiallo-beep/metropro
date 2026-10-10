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

function escapeHtml(value: string | number) {
  return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
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

export function analyticsToPrintableHtml(data: AnalyticsReportData, periodLabel: string) {
  const summary = [
    ["Net revenue", dollars(data.revenueSummary.netRevenueCents)],
    ["Gross ticket revenue", dollars(data.revenueSummary.grossTicketRevenueCents)],
    ["Membership revenue", dollars(data.revenueSummary.membershipRevenueCents)],
    ["Successful refunds", dollars(data.revenueSummary.refundsCents)],
    ["Confirmed bookings", data.revenueSummary.confirmedBookings],
    ["Successful ticket payments", data.revenueSummary.paidTicketTransactions],
  ];
  const table = (headers: string[], rows: Array<Array<string | number>>) => `<table><thead><tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(value => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const trend = table(["Date", "Ticket gross", "Memberships", "Refunds", "Net revenue"], data.revenueTrend.map(row => [row.date, dollars(row.grossTicketCents), dollars(row.membershipCents), dollars(row.refundsCents), dollars(row.netRevenueCents)]));
  const routes = table(["Route ID", "Trips", "Seats", "Capacity", "Occupancy", "Revenue", "Average / trip"], data.routePerformance.map(row => [row.routeId, row.trips, `${row.seatsSold}`, row.capacity, `${row.occupancyPercent}%`, dollars(row.revenueCents), dollars(row.averageRevenuePerTripCents)]));
  const vehicles = table(["Vehicle ID", "Vehicle", "Revenue"], data.revenueByVehicle.map(row => [row.vehicleId, row.code, dollars(row.revenueCents)]));
  const occupancy = table(["Departure", "Route", "Date", "Seats", "Capacity", "Occupancy", "Band"], data.occupancyByDeparture.map(row => [row.departureId, row.routeId, row.departAt.toISOString().slice(0, 10), row.seatsSold, row.capacity, `${row.occupancyPercent}%`, row.band]));
  return `<!doctype html><html><head><meta charset="utf-8"><title>MetroPro Revenue Report</title><style>
    @page{size:letter;margin:0.55in}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#1f2933;font-size:10px;line-height:1.35;margin:0}h1{font-size:22px;margin:0;color:#245a78}h2{font-size:14px;margin:22px 0 7px;color:#245a78;border-bottom:2px solid #dce8e5;padding-bottom:4px}p{margin:3px 0;color:#657477}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:16px 0}.metric{border:1px solid #dce8e5;border-radius:7px;padding:8px}.metric strong{display:block;font-size:13px;color:#245a78;margin-top:3px}table{width:100%;border-collapse:collapse;margin-top:7px;page-break-inside:auto}thead{display:table-header-group}tr{page-break-inside:avoid}th,td{text-align:left;border-bottom:1px solid #e5ece9;padding:5px 4px}th{background:#edf5f2;color:#245a78;font-weight:700}.muted{color:#657477}.footer{margin-top:24px;font-size:9px;color:#657477}@media print{h2{break-after:avoid}.section{break-inside:avoid}}
  </style></head><body><h1>MetroPro Revenue Reporting</h1><p class="muted">Period: ${escapeHtml(periodLabel)} · Generated ${escapeHtml(new Date().toLocaleString())}</p><div class="summary">${summary.map(([label, value]) => `<div class="metric"><span class="muted">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div><section class="section"><h2>Daily Revenue Trend</h2>${trend || "<p>No revenue activity recorded.</p>"}</section><section class="section"><h2>Route Performance</h2>${routes || "<p>No route activity recorded.</p>"}</section><section class="section"><h2>Revenue by Vehicle</h2>${vehicles || "<p>No vehicle revenue recorded.</p>"}</section><section class="section"><h2>Departure Occupancy</h2>${occupancy || "<p>No departure activity recorded.</p>"}</section><p class="footer">MetroPro administrative report. Currency values are shown in USD.</p></body></html>`;
}
