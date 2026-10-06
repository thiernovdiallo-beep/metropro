import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, isoDate, moneyExact } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "wouter";

type Period = "today" | "week" | "month" | "custom" | "all";

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="ticket-card p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 font-serif text-2xl">{value}</p>{note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}</div>;
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
  const hasDaySales = Boolean(a?.popularDays.some(item => item.seats > 0));
  return <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Operations intelligence</p><h1 className="mt-1 font-serif text-3xl">Analytics</h1>
    <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Occupancy uses departure dates; revenue uses recorded successful payment dates. Periods follow New York local calendar days. Active memberships are the current count.</p>
    <div className="ticket-card mt-5 flex flex-wrap items-end gap-3 p-4" role="group" aria-label="Analytics date range">
      {([ ["today", "Today"], ["week", "This week"], ["month", "This month"], ["custom", "Custom"], ["all", "All time"] ] as const).map(([value, label]) => <Button key={value} type="button" className="min-h-11" variant={period === value ? "default" : "outline"} onClick={() => { setPeriod(value); if (value !== "custom") setApplied({ period: value }); }}>{label}</Button>)}
      {period === "custom" ? <form className="flex w-full flex-wrap items-end gap-3 border-t border-border pt-3" onSubmit={event => { event.preventDefault(); if (from && to && from <= to) setApplied({ period: "custom", from, to }); }}>
        <label className="grid gap-1 text-sm">From<Input type="date" required className="h-11" value={from} onChange={event => setFrom(event.target.value)} /></label>
        <label className="grid gap-1 text-sm">To<Input type="date" required min={from} className="h-11" value={to} onChange={event => setTo(event.target.value)} /></label>
        <Button type="submit" className="min-h-11">Apply dates</Button></form> : null}
    </div>
    {q.isLoading ? <p role="status" className="mt-6">Loading live metrics…</p> : null}
    {q.error ? <div role="alert" className="ticket-card mt-5 p-5 text-sm">Metrics could not be loaded. {q.error.message} <button className="font-semibold text-primary underline" onClick={() => void q.refetch()}>Try again</button></div> : null}
    {a ? <>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Metric label="Average paid seat fare" value={moneyExact(a.averageTicketCents)} note="Successful ticket payments ÷ their booked seats" /><Metric label="Membership receipts" value={moneyExact(a.membershipRevenueCents)} note="Membership payments recorded in this period" /><Metric label="Active memberships" value={String(a.activeMembers)} note="Current active subscriptions" /><Metric label="Repeat signed-in customers" value={`${a.repeatCustomerPercent}%`} note="Confirmed account bookings in period" /><Metric label="Booking cancellation rate" value={`${a.cancellationRate}%`} note="Canceled among bookings created in period" /><Metric label="Passenger no-show rate" value={`${a.noShowRate}%`} note="No-show among saved passenger rows" /></div>
      <div className="mt-6 grid min-w-0 gap-5 lg:grid-cols-2"><ChartPanel title="Seat occupancy by route" description="Percent sold of scheduled seats on departures in this period" data={occupancy} valueKey="percent" unit="%" empty="No scheduled departures in this date range." />
        <ChartPanel title="Paid ticket revenue by route" description="Successful ticket payments recorded in this period, assigned to their routes" data={ticketRevenue} valueKey="dollars" unit="USD" empty="No successful ticket payments recorded in this period." />
        <ChartPanel title="Paid ticket revenue by vehicle" description="Real paid tickets associated with assigned vehicles" data={vehicleRevenue} valueKey="dollars" unit="USD" empty="No vehicle-linked ticket payments recorded." />
        <ChartPanel title="Seats sold by departure day" description="Current sold seats across departures in this period" data={hasDaySales ? (a.popularDays ?? []).map(day => ({ name: day.day, seats: day.seats })) : []} valueKey="seats" unit="seats" empty="No seats sold on departures in this date range." />
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-2"><section className="ticket-card p-5"><h2 className="font-serif text-xl">Capacity signals</h2><p className="mt-1 text-xs text-muted-foreground">70%, 80%, 90% and sold-out thresholds use booked seats for departures in the selected period.</p>
        {(a.addVanSignals ?? []).length ? (a.addVanSignals ?? []).map(item => <p key={item.routeId} className="mt-3 text-sm"><strong>{routeName(item.routeId)}</strong> · {item.band} occupancy across {item.trips} trip{item.trips === 1 ? "" : "s"}</p>) : <p className="mt-3 text-sm text-muted-foreground">No routes reached 70% occupancy in this range.</p>}
      </section><section className="ticket-card p-5"><h2 className="font-serif text-xl">Revenue by trip</h2><p className="mt-1 text-xs text-muted-foreground">Only trips with recorded paid revenue in the selected period.</p>
        {(a.revenuePerTrip ?? []).filter(item => item.revenueCents > 0).slice(0, 10).map(item => <p key={item.departureId} className="mt-3 flex justify-between gap-2 text-sm"><Link href={`/admin/trips/${item.departureId}`} className="font-semibold text-primary underline">Trip #{item.departureId}</Link><span>{moneyExact(item.revenueCents)}</span></p>)}
        {!a.revenuePerTrip.some(item => item.revenueCents > 0) ? <p className="mt-3 text-sm text-muted-foreground">No paid trip revenue recorded for this range.</p> : null}
      </section></div>
      <section className="ticket-card mt-5 p-5"><h2 className="font-serif text-xl">Departure occupancy</h2>
        {(a.occupancyByDeparture ?? []).slice(0, 15).map(item => <div key={item.departureId} className="mt-3 flex flex-wrap justify-between gap-2 border-t border-border pt-3 text-sm"><Link href={`/admin/trips/${item.departureId}`} className="font-semibold text-primary underline">{routeName(item.routeId)} · {formatDate(item.departAt)}</Link><span>{item.seatsSold}/{item.capacity} · {item.band === "under_70" ? `${item.occupancyPercent}%` : item.band}</span></div>)}
        {!a.occupancyByDeparture.length ? <p className="mt-3 text-sm text-muted-foreground">No scheduled departures in this date range.</p> : null}
      </section>
    </> : null}
  </div>;
}

function ChartPanel({ title, description, data, valueKey, unit, empty }: {
  title: string; description: string; data: Record<string, string | number>[]; valueKey: string; unit: "%" | "USD" | "seats"; empty: string;
}) {
  return <section className="ticket-card min-w-0 p-5" aria-label={title}><h2 className="font-serif text-xl">{title}</h2><p className="mt-1 text-xs text-muted-foreground">{description}</p>
    {data.length ? <div className="mt-4 h-64 w-full min-w-0"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 16 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" fontSize={11} interval={0} angle={-10} textAnchor="end" height={46} /><YAxis fontSize={11} width={42} /><Tooltip formatter={value => unit === "USD" ? moneyExact(Math.round(Number(value) * 100)) : `${value}${unit === "%" ? "%" : " seats"}`} /><Bar dataKey={valueKey} fill="#137a86" radius={[6, 6, 0, 0]} maxBarSize={54} /></BarChart></ResponsiveContainer></div> : <p className="mt-6 text-sm text-muted-foreground">{empty}</p>}
  </section>;
}
