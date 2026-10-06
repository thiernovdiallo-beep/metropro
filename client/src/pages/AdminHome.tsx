import { PageShell } from "@/components/Brand";
import { formatDate, formatTime, money, occupancyLabel } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="ticket-card p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-serif text-2xl">{value}</div>
    </div>
  );
}

export default function AdminHome() {
  const kpis = trpc.admin.kpis.useQuery();
  const trips = trpc.admin.tripsToday.useQuery();
  const upcoming = trpc.admin.upcomingDepartures.useQuery();
  const messages = trpc.admin.messages.useQuery();
  const support = trpc.admin.supportTickets.useQuery();
  const activity = trpc.admin.recentBookings.useQuery();
  const k = kpis.data;
  return (
    <PageShell>
      <div className="container py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Operations</p>
            <h1 className="font-serif text-3xl">Today</h1>
          </div>
          <nav className="flex flex-wrap gap-2 text-sm">
            <Link href="/admin/dispatch">Dispatch</Link>
            <Link href="/admin/schedule">Schedule</Link>
            <Link href="/admin/bookings">Bookings</Link>
            <Link href="/admin/payments">Payments</Link>
            <Link href="/admin/support">Support</Link>
            <Link href="/admin/fleet">Fleet</Link>
            <Link href="/admin/routes">Routes</Link>
            <Link href="/admin/analytics">Analytics</Link>
            <Link href="/admin/settings">Settings</Link>
          </nav>
        </div>
        {kpis.isLoading ? <p role="status" className="mt-5 text-sm">Loading live operations…</p> : null}
        {kpis.error ? <p role="alert" className="mt-5 text-sm text-destructive">Operations could not be loaded. Refresh or try again later.</p> : null}
        {k ? (
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
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
          </div>
        ) : null}
        <h2 className="mt-10 font-serif text-xl">Trips scheduled today</h2>
        <div className="mt-3 grid gap-2">
          {(trips.data ?? []).map(t =>
            t ? (
              <Link key={t.departure.id} href={`/admin/trips/${t.departure.id}`} className="ticket-card block p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    {t.origin?.name} → {t.destination?.name} · {t.vehicle?.code} · {t.driver?.fullName}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {t.seatsSold}/{t.departure.capacity} · {money(t.revenueCents)} · {t.tripStatus}
                  </div>
                </div>
              </Link>
            ) : null
          )}
          {!trips.isLoading && !trips.data?.length ? <p className="ticket-card p-4 text-sm text-muted-foreground">No trips scheduled today.</p> : null}
        </div>
        <div className="mt-9 grid gap-6 lg:grid-cols-3">
          <section><h2 className="font-serif text-xl">Upcoming departures</h2><div className="mt-3 grid gap-2">{(upcoming.data ?? []).map(t => t ? <Link key={t.departure.id} href={`/admin/trips/${t.departure.id}`} className="ticket-card block min-h-16 p-4 text-sm"><strong>{t.origin?.name} → {t.destination?.name}</strong><span className="block text-muted-foreground">{formatDate(t.departure.departAt)} {formatTime(t.departure.departAt)} · {t.vehicle?.code ?? "No vehicle"} · {t.seatsSold}/{t.departure.capacity} sold</span></Link> : null)}{!upcoming.isLoading && !upcoming.data?.length ? <p className="ticket-card p-4 text-sm text-muted-foreground">No upcoming departures.</p> : null}</div></section>
          <section><h2 className="font-serif text-xl">Recent booking activity</h2><div className="mt-3 grid gap-2">{(activity.data ?? []).map(item => <Link key={item.id} href={`/admin/bookings/${item.id}`} className="ticket-card block min-h-16 p-4 text-sm"><strong>{item.bookingNumber}</strong> · {item.contactFirstName} {item.contactLastName}<span className="block capitalize text-muted-foreground">{item.status.replace("_", " ")} · {item.createdAt.toLocaleString()}</span></Link>)}{!activity.isLoading && !activity.data?.length ? <p className="ticket-card p-4 text-sm text-muted-foreground">No bookings recorded yet.</p> : null}</div></section>
          <section><h2 className="font-serif text-xl">Alerts and activity</h2><div className="mt-3 grid gap-2">
            {k && k.failedRefunds > 0 ? <Link href="/admin/payments" className="ticket-card block border-l-4 border-l-destructive p-4 text-sm text-destructive"><strong>{k.failedRefunds} failed Stripe refund{k.failedRefunds === 1 ? "" : "s"}</strong> · Review charges and contact affected customers.</Link> : null}
            {k && k.pendingRefunds > 0 ? <Link href="/admin/payments" className="ticket-card block p-4 text-sm"><strong>{k.pendingRefunds} pending refund{k.pendingRefunds === 1 ? "" : "s"}</strong> · Funds have not been confirmed returned.</Link> : null}
            {(trips.data ?? []).filter(t => t && t.seatsRemaining <= 2).map(t => t ? <Link key={`low-${t.departure.id}`} href={`/admin/trips/${t.departure.id}`} className="ticket-card block p-4 text-sm"><strong>Low availability</strong> · {t.origin?.name} → {t.destination?.name} · {t.seatsRemaining} remaining</Link> : null)}
            {(support.data ?? []).filter(item => item.status === "open").slice(0, 3).map(item => <Link key={`support-${item.id}`} href="/admin/support" className="ticket-card block p-4 text-sm"><strong>Support request</strong> · {item.subject}</Link>)}
            {(messages.data ?? []).slice(0, 3).map(item => <div key={`message-${item.id}`} className="ticket-card p-4 text-sm"><strong className="capitalize">{item.kind.replace("_", " ")}</strong> · {item.message}</div>)}
            {!messages.isLoading && !support.isLoading && !(k?.failedRefunds || k?.pendingRefunds || messages.data?.length || support.data?.some(item => item.status === "open") || trips.data?.some(t => t && t.seatsRemaining <= 2)) ? <p className="ticket-card p-4 text-sm text-muted-foreground">No current operational alerts.</p> : null}
          </div></section>
        </div>
      </div>
    </PageShell>
  );
}
