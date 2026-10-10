import { PageIntro, ResourceState, StatusBadge, StatusNotice } from "@/components/MetroUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { analyticsToCsv, analyticsToPrintableHtml } from "@/lib/analytics-export";
import { formatDate, isoDate, moneyExact } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "wouter";

type Period = "today" | "week" | "month" | "custom" | "all";

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="ticket-card p-4 sm:p-5"><p className="metro-eyebrow mb-1 text-[0.68rem] tracking-[0.12em]">{label}</p><p className="font-serif text-2xl font-semibold tabular-nums text-primary">{value}</p>{note ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{note}</p> : null}</div>;
}

function occupancyTone(band: string) {
  const key = band.toLowerCase();
  if (key.includes("sold") || key.includes("90")) return "error" as const;
  if (key.includes("70") || key.includes("80")) return "pending" as const;
  return "info" as const;
}

export default function AnalyticsDashboard() {
  const [period, setPeriod] = useState<Period>("month");
  const [from, setFrom] = useState(isoDate());
  const [to, setTo] = useState(isoDate());
  const [applied, setApplied] = useState<{ period: Period; from?: string; to?: string }>({ period: "month" });
  const q = trpc.admin.analytics.useQuery(applied, { retry: false });
  const routes = trpc.admin.routes.useQuery();
  const cities = trpc.admin.cities.useQuery();
  const vans = trpc.admin.vehicles.useQuery();
  const a = q.data;
  const cityCode = (id: number) => cities.data?.find(city => city.id === id)?.code ?? String(id);
  const routeName = (id: number) => { const route = routes.data?.find(item => item.id === id); return route ? `${cityCode(route.originCityId)} → ${cityCode(route.destinationCityId)}` : `Route ${id}`; };
  const occupancy = (a?.occupancyByRoute ?? []).filter(item => item.trips > 0).map(item => ({ name: routeName(item.routeId), percent: item.occupancyPercent, trips: item.trips, band: item.band }));
  const ticketRevenue = (a?.revenueByRoute ?? []).filter(item => item.revenueCents > 0).map(item => ({ name: routeName(item.routeId), dollars: item.revenueCents / 100 }));
  const vehicleRevenue = (a?.revenueByVehicle ?? []).filter(item => item.revenueCents > 0).map(item => ({ name: vans.data?.find(van => van.id === item.vehicleId)?.code ?? item.code, dollars: item.revenueCents / 100 }));
  const revenueTrend = (a?.revenueTrend ?? []).map(item => ({
    name: item.date.slice(5),
    gross: item.grossTicketCents / 100,
    membership: item.membershipCents / 100,
    refunds: item.refundsCents / 100,
    net: item.netRevenueCents / 100,
  }));
  const exportReport = () => {
    if (!a) return;
    const periodLabel = applied.period === "custom" ? `${applied.from} to ${applied.to}` : applied.period;
    const csv = analyticsToCsv(a, periodLabel);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `metropro-revenue-report-${applied.period}-${isoDate()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };
  const printPdfReport = () => {
    if (!a) return;
    const periodLabel = applied.period === "custom" ? `${applied.from} to ${applied.to}` : applied.period;
    const reportWindow = window.open("", "_blank");
    if (!reportWindow) return;
    reportWindow.document.open();
    reportWindow.document.write(analyticsToPrintableHtml(a, periodLabel));
    reportWindow.document.close();
    reportWindow.setTimeout(() => { reportWindow.focus(); reportWindow.print(); }, 250);
  };
  const hasDaySales = Boolean(a?.popularDays.some(item => item.seats > 0));
  return <div className="min-w-0"><PageIntro eyebrow="Operations intelligence" title="Analytics" description="Occupancy uses departure dates; revenue uses recorded successful payment dates. Periods follow New York local calendar days. Active memberships are the current count." />
    <section className="ticket-card flex flex-wrap items-end gap-3 p-4" role="group" aria-label="Analytics date range">
      {([ ["today", "Today"], ["week", "This week"], ["month", "This month"], ["custom", "Custom"], ["all", "All time"] ] as const).map(([value, label]) => <Button key={value} type="button" className="min-h-11" variant={period === value ? "default" : "outline"} onClick={() => { setPeriod(value); if (value !== "custom") setApplied({ period: value }); }}>{label}</Button>)}
      {period === "custom" ? <form className="flex w-full flex-wrap items-end gap-3 border-t border-border pt-4" onSubmit={event => { event.preventDefault(); if (from && to && from <= to) setApplied({ period: "custom", from, to }); }}>
        <label className="form-field">From<Input type="date" required className="metro-control" value={from} onChange={event => setFrom(event.target.value)} /></label>
        <label className="form-field">To<Input type="date" required min={from} className="metro-control" value={to} onChange={event => setTo(event.target.value)} /></label>
        <Button type="submit" className="min-h-11">Apply dates</Button></form> : null}
      <div className="flex flex-wrap gap-2 sm:ml-auto"><Button type="button" variant="outline" className="min-h-11" disabled={!a || q.isFetching} onClick={exportReport}>Download CSV report</Button><Button type="button" variant="outline" className="min-h-11" disabled={!a || q.isFetching} onClick={printPdfReport}>Print / Save PDF</Button></div>
    </section>
    {routes.error || cities.error || vans.error ? <StatusNotice tone="pending" className="mt-5">Some route or vehicle labels are still loading; metrics remain based on the selected period.</StatusNotice> : null}
    <div className="mt-6"><ResourceState loading={q.isLoading} error={q.error ? `Metrics could not be loaded. ${q.error.message}` : null} empty={!a} emptyTitle="No analytics data available" emptyDescription="Metrics will appear when operational data is available for this period." onRetry={() => void q.refetch()}>
      {a ? <><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Net revenue" value={moneyExact(a.revenueSummary.netRevenueCents)} note="Ticket and membership receipts less successful refunds" /><Metric label="Gross ticket revenue" value={moneyExact(a.revenueSummary.grossTicketRevenueCents)} note={`${a.revenueSummary.paidTicketTransactions} successful ticket payment${a.revenueSummary.paidTicketTransactions === 1 ? "" : "s"}`} /><Metric label="Membership receipts" value={moneyExact(a.revenueSummary.membershipRevenueCents)} note="Membership payments recorded in this period" /><Metric label="Refunds" value={moneyExact(a.revenueSummary.refundsCents)} note="Successful refunds updated in this period" /><Metric label="Average paid seat fare" value={moneyExact(a.averageTicketCents)} note="Successful ticket payments ÷ their booked seats" /><Metric label="Confirmed bookings" value={String(a.revenueSummary.confirmedBookings)} note="Confirmed bookings created in this period" /><Metric label="Active memberships" value={String(a.activeMembers)} note="Current active subscriptions" /><Metric label="Repeat signed-in customers" value={`${a.repeatCustomerPercent}%`} note="Confirmed account bookings in period" /><Metric label="Booking cancellation rate" value={`${a.cancellationRate}%`} note="Canceled among bookings created in period" /><Metric label="Passenger no-show rate" value={`${a.noShowRate}%`} note="No-show among saved passenger rows" /></div>
      <div className="mt-6"><RevenueTrendPanel data={revenueTrend} /></div>
      <div className="mt-6 grid min-w-0 gap-5 lg:grid-cols-2"><ChartPanel title="Seat occupancy by route" description="Percent sold of scheduled seats on departures in this period" data={occupancy} valueKey="percent" unit="%" empty="No scheduled departures in this date range." />
        <ChartPanel title="Paid ticket revenue by route" description="Successful ticket payments recorded in this period, assigned to their routes" data={ticketRevenue} valueKey="dollars" unit="USD" empty="No successful ticket payments recorded in this period." />
        <ChartPanel title="Paid ticket revenue by vehicle" description="Real paid tickets associated with assigned vehicles" data={vehicleRevenue} valueKey="dollars" unit="USD" empty="No vehicle-linked ticket payments recorded." />
        <ChartPanel title="Seats sold by departure day" description="Current sold seats across departures in this period" data={hasDaySales ? (a.popularDays ?? []).map(day => ({ name: day.day, seats: day.seats })) : []} valueKey="seats" unit="seats" empty="No seats sold on departures in this date range." />
      </div>
      <section className="ticket-card mt-6 p-5"><h2 className="metro-section-title text-xl">Route performance</h2><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Compare demand, net assigned revenue, and average revenue per scheduled trip.</p><div className="metro-responsive-table mt-4"><table><thead><tr><th scope="col">Route</th><th scope="col">Trips</th><th scope="col">Occupancy</th><th scope="col">Revenue</th><th scope="col">Avg / trip</th></tr></thead><tbody>{(a.routePerformance ?? []).sort((left, right) => right.revenueCents - left.revenueCents).map(item => <tr key={item.routeId}><td className="font-semibold">{routeName(item.routeId)}</td><td className="tabular-nums">{item.trips}</td><td className="tabular-nums">{item.seatsSold}/{item.capacity} · {item.occupancyPercent}%</td><td className="tabular-nums">{moneyExact(item.revenueCents)}</td><td className="tabular-nums">{moneyExact(item.averageRevenuePerTripCents)}</td></tr>)}</tbody></table>{!a.routePerformance?.length ? <p className="text-sm text-muted-foreground">No route activity recorded in this period.</p> : null}</div></section>
      <div className="mt-6 grid gap-5 lg:grid-cols-2"><section className="ticket-card p-5"><h2 className="metro-section-title text-xl">Capacity signals</h2><p className="mt-2 text-xs leading-relaxed text-muted-foreground">70%, 80%, 90% and sold-out thresholds use booked seats for departures in the selected period.</p>
        {(a.addVanSignals ?? []).length ? <div className="mt-4 grid gap-2">{(a.addVanSignals ?? []).map(item => <div key={item.routeId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary p-3 text-sm"><span><strong>{routeName(item.routeId)}</strong> · {item.trips} trip{item.trips === 1 ? "" : "s"}</span><StatusBadge status={occupancyTone(item.band)} label={item.band.replaceAll("_", " ")} /></div>)}</div> : <p className="mt-4 text-sm text-muted-foreground">No routes reached 70% occupancy in this range.</p>}
      </section><section className="ticket-card p-5"><h2 className="metro-section-title text-xl">Revenue by trip</h2><p className="mt-2 text-xs text-muted-foreground">Only trips with recorded paid revenue in the selected period.</p>
        {(a.revenuePerTrip ?? []).filter(item => item.revenueCents > 0).slice(0, 10).map(item => <p key={item.departureId} className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm"><Link href={`/admin/trips/${item.departureId}`} className="font-semibold text-primary underline">Trip #{item.departureId}</Link><span className="tabular-nums">{moneyExact(item.revenueCents)}</span></p>)}
        {!a.revenuePerTrip.some(item => item.revenueCents > 0) ? <p className="mt-4 text-sm text-muted-foreground">No paid trip revenue recorded for this range.</p> : null}
      </section></div>
      <section className="ticket-card mt-5 p-5"><h2 className="metro-section-title text-xl">Departure occupancy</h2>
        <div className="metro-responsive-table mt-4">{a.occupancyByDeparture.length ? <table><thead><tr><th scope="col">Departure</th><th scope="col">Occupancy</th><th scope="col">Signal</th></tr></thead><tbody>{(a.occupancyByDeparture ?? []).slice(0, 15).map(item => <tr key={item.departureId}><td><Link href={`/admin/trips/${item.departureId}`} className="font-semibold text-primary underline">{routeName(item.routeId)} · {formatDate(item.departAt)}</Link></td><td className="tabular-nums">{item.seatsSold}/{item.capacity} · {item.occupancyPercent}%</td><td><StatusBadge status={occupancyTone(item.band)} label={item.band.replaceAll("_", " ")} /></td></tr>)}</tbody></table> : <p className="text-sm text-muted-foreground">No scheduled departures in this date range.</p>}</div>
      </section>
      </> : null}
    </ResourceState></div>
  </div>;
}

function RevenueTrendPanel({ data }: { data: { name: string; gross: number; membership: number; refunds: number; net: number }[] }) {
  return <section className="ticket-card min-w-0 p-5" aria-label="Revenue trend"><h2 className="metro-section-title text-xl">Revenue trend</h2><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Daily gross receipts, refunds, and net revenue in the selected New York calendar period.</p>
    {data.length ? <div className="mt-4 h-72 w-full min-w-0"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 16 }}><CartesianGrid stroke="var(--metro-line)" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" stroke="var(--metro-muted)" fontSize={11} /><YAxis stroke="var(--metro-muted)" fontSize={11} width={48} tickFormatter={value => `$${value}`} /><Tooltip contentStyle={{ borderColor: "var(--metro-line)", borderRadius: "12px", color: "var(--metro-ink)" }} formatter={value => moneyExact(Math.round(Number(value) * 100))} /><Line type="monotone" dataKey="gross" name="Ticket gross" stroke="var(--chart-1)" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="membership" name="Memberships" stroke="var(--chart-2)" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="refunds" name="Refunds" stroke="var(--metro-warning)" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="net" name="Net revenue" stroke="var(--metro-success)" strokeWidth={3} dot={false} /></LineChart></ResponsiveContainer></div> : <p className="mt-6 text-sm text-muted-foreground">No revenue activity recorded in this period.</p>}
  </section>;
}

function ChartPanel({ title, description, data, valueKey, unit, empty }: {
  title: string; description: string; data: Record<string, string | number>[]; valueKey: string; unit: "%" | "USD" | "seats"; empty: string;
}) {
  return <section className="ticket-card min-w-0 p-5" aria-label={title}><h2 className="metro-section-title text-xl">{title}</h2><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{description}</p>
    {data.length ? <div className="mt-4 h-64 w-full min-w-0"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 16 }}><CartesianGrid stroke="var(--metro-line)" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" stroke="var(--metro-muted)" fontSize={11} interval={0} angle={-10} textAnchor="end" height={46} /><YAxis stroke="var(--metro-muted)" fontSize={11} width={42} /><Tooltip contentStyle={{ borderColor: "var(--metro-line)", borderRadius: "12px", color: "var(--metro-ink)" }} formatter={value => unit === "USD" ? moneyExact(Math.round(Number(value) * 100)) : `${value}${unit === "%" ? "%" : " seats"}`} /><Bar dataKey={valueKey} fill="var(--chart-1)" radius={[6, 6, 0, 0]} maxBarSize={54} /></BarChart></ResponsiveContainer></div> : <p className="mt-6 text-sm text-muted-foreground">{empty}</p>}
  </section>;
}
