import { AdminLayout } from "@/layouts/AdminLayout";
import { PageIntro, ResourceState, StatusBadge, StatusNotice } from "@/components/MetroUI";
import { formatDate, formatTime, money } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";

function Kpi({ label, value }: { label: string; value: string }) {
  return <div className="ticket-card p-4 sm:p-5">
    <div className="metro-eyebrow mb-1 text-[0.68rem] tracking-[0.12em]">{label}</div>
    <div className="font-serif text-2xl font-semibold tabular-nums text-primary">{value}</div>
  </div>;
}

export default function AdminHome() {
  const kpis = trpc.admin.kpis.useQuery();
  const trips = trpc.admin.tripsToday.useQuery();
  const upcoming = trpc.admin.upcomingDepartures.useQuery();
  const messages = trpc.admin.messages.useQuery();
  const support = trpc.admin.supportTickets.useQuery();
  const activity = trpc.admin.recentBookings.useQuery();
  const k = kpis.data;
  const queryError = (error: { message?: string } | null) => error ? "Operations could not be loaded. Refresh or try again later." : null;

  return <AdminLayout><div className="metro-page metro-page--wide">
    <PageIntro eyebrow="Operations" title="Today" description="A live view of service, passenger demand, and items needing staff attention." />

    <ResourceState loading={kpis.isLoading} error={queryError(kpis.error)} empty={!k} emptyTitle="No live operations summary" emptyDescription="Live metrics will appear here when operations data is available." onRetry={() => void kpis.refetch()}>
      {k ? <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Trips today" value={String(k.tripsToday)} />
        <Kpi label="Bookings created today" value={String(k.bookingsToday)} />
        <Kpi label="Operational vans" value={String(k.activeVans)} />
        <Kpi label="Active drivers" value={String(k.activeDrivers)} />
        <Kpi label="Passengers on today's trips" value={String(k.ticketsSold)} />
        <Kpi label="Seats available" value={String(k.seatsAvailable)} />
        <Kpi label="Occupancy" value={`${k.occupancyPercent}%`} />
        <Kpi label="Revenue today" value={money(k.revenueTodayCents)} />
        <Kpi label="Revenue this week" value={money(k.revenueWeekCents)} />
        <Kpi label="Revenue this month" value={money(k.revenueMonthCents)} />
        <Kpi label="Active memberships" value={String(k.activeMemberships)} />
        <Kpi label="Membership MRR" value={money(k.mrrCents)} />
        <Kpi label="Cancellations" value={String(k.cancellationsToday)} />
        <Kpi label="Refunds completed today" value={String(k.refundsToday)} />
        <Kpi label="Refunds pending" value={String(k.pendingRefunds)} />
        <Kpi label="Refunds failed" value={String(k.failedRefunds)} />
        <Kpi label="Delayed trips" value={String(k.delayedTrips)} />
      </div> : null}
    </ResourceState>

    <section id="today-trips" className="mt-10" aria-labelledby="today-trips-title">
      <h2 id="today-trips-title" className="metro-section-title">Trips scheduled today</h2>
      <div className="mt-3">
        <ResourceState loading={trips.isLoading} error={queryError(trips.error)} empty={!trips.data?.length} emptyTitle="No trips scheduled today" emptyDescription="Scheduled departures for today will be shown here." onRetry={() => void trips.refetch()}>
          <div className="grid gap-3">{(trips.data ?? []).map(t => t ? <Link key={t.departure.id} href={`/admin/trips/${t.departure.id}`} className="ticket-card block min-h-20 p-4 transition-colors hover:border-primary">
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><strong>{t.origin?.name} → {t.destination?.name}</strong><span className="mt-1 block text-sm text-muted-foreground">{t.vehicle?.code ?? "No vehicle"} · {t.driver?.fullName ?? "No driver"}</span></div>
              <div className="flex flex-wrap items-center gap-2 text-sm"><StatusBadge status={t.tripStatus} /><span className="tabular-nums text-muted-foreground">{t.seatsSold}/{t.departure.capacity} · {money(t.revenueCents)}</span></div>
            </div>
          </Link> : null)}</div>
        </ResourceState>
      </div>
    </section>

    <div className="mt-9 grid gap-6 lg:grid-cols-3">
      <section aria-labelledby="upcoming-departures-title"><h2 id="upcoming-departures-title" className="metro-section-title text-xl">Upcoming departures</h2><div className="mt-3"><ResourceState loading={upcoming.isLoading} error={queryError(upcoming.error)} empty={!upcoming.data?.length} emptyTitle="No upcoming departures" onRetry={() => void upcoming.refetch()}>
        <div className="grid gap-3">{(upcoming.data ?? []).map(t => t ? <Link key={t.departure.id} href={`/admin/trips/${t.departure.id}`} className="ticket-card block min-h-20 p-4 text-sm transition-colors hover:border-primary"><div className="flex flex-wrap items-start justify-between gap-2"><strong>{t.origin?.name} → {t.destination?.name}</strong><StatusBadge status={t.departure.status} /></div><span className="mt-1 block text-muted-foreground">{formatDate(t.departure.departAt)} {formatTime(t.departure.departAt)} · {t.vehicle?.code ?? "No vehicle"} · {t.seatsSold}/{t.departure.capacity} sold</span></Link> : null)}</div>
      </ResourceState></div></section>
      <section aria-labelledby="recent-bookings-title"><h2 id="recent-bookings-title" className="metro-section-title text-xl">Recent booking activity</h2><div className="mt-3"><ResourceState loading={activity.isLoading} error={queryError(activity.error)} empty={!activity.data?.length} emptyTitle="No bookings recorded yet" onRetry={() => void activity.refetch()}>
        <div className="grid gap-3">{(activity.data ?? []).map(item => <Link key={item.id} href={`/admin/bookings/${item.id}`} className="ticket-card block min-h-20 p-4 text-sm transition-colors hover:border-primary"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{item.bookingNumber}</strong><StatusBadge status={item.status} /></div><span className="mt-1 block text-muted-foreground">{item.contactFirstName} {item.contactLastName} · {item.createdAt.toLocaleString()}</span></Link>)}</div>
      </ResourceState></div></section>
      <section aria-labelledby="alerts-title"><h2 id="alerts-title" className="metro-section-title text-xl">Alerts and activity</h2><div className="mt-3 grid gap-3">
        {k && k.failedRefunds > 0 ? <Link href="/admin/payments" className="ticket-card block border-l-4 border-l-destructive p-4 text-sm text-destructive"><strong>{k.failedRefunds} failed Stripe refund{k.failedRefunds === 1 ? "" : "s"}</strong><span className="mt-1 block">Review charges and contact affected customers.</span></Link> : null}
        {k && k.pendingRefunds > 0 ? <StatusNotice tone="pending"><strong>{k.pendingRefunds} pending refund{k.pendingRefunds === 1 ? "" : "s"}</strong> · Funds have not been confirmed returned.</StatusNotice> : null}
        {(trips.data ?? []).filter(t => t && t.seatsRemaining <= 2).map(t => t ? <Link key={`low-${t.departure.id}`} href={`/admin/trips/${t.departure.id}`} className="ticket-card block p-4 text-sm"><strong>Low availability</strong><span className="mt-1 block text-muted-foreground">{t.origin?.name} → {t.destination?.name} · {t.seatsRemaining} remaining</span></Link> : null)}
        {(support.data ?? []).filter(item => item.status === "open").slice(0, 3).map(item => <Link key={`support-${item.id}`} href="/admin/support" className="ticket-card block p-4 text-sm"><strong>Support request</strong><span className="mt-1 block text-muted-foreground">{item.subject}</span></Link>)}
        {(messages.data ?? []).slice(0, 3).map(item => <div key={`message-${item.id}`} className="ticket-card p-4 text-sm"><strong className="capitalize">{item.kind.replace("_", " ")}</strong><span className="mt-1 block text-muted-foreground">{item.message}</span></div>)}
        {!messages.isLoading && !support.isLoading && !(k?.failedRefunds || k?.pendingRefunds || messages.data?.length || support.data?.some(item => item.status === "open") || trips.data?.some(t => t && t.seatsRemaining <= 2)) ? <div className="ticket-card p-5 text-sm text-muted-foreground">No current operational alerts.</div> : null}
      </div></section>
    </div>
  </div></AdminLayout>;
}
