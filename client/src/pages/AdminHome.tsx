import { PageShell } from "@/components/Brand";
import { money, occupancyLabel } from "@/lib/format";
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
            <Link href="/admin/fleet">Fleet</Link>
            <Link href="/admin/routes">Routes</Link>
            <Link href="/admin/analytics">Analytics</Link>
            <Link href="/admin/settings">Settings</Link>
          </nav>
        </div>
        {k ? (
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Trips today" value={String(k.tripsToday)} />
            <Kpi label="Active vans" value={String(k.activeVans)} />
            <Kpi label="Active drivers" value={String(k.activeDrivers)} />
            <Kpi label="Tickets sold" value={String(k.ticketsSold)} />
            <Kpi label="Seats available" value={String(k.seatsAvailable)} />
            <Kpi label="Occupancy" value={`${k.occupancyPercent}%`} />
            <Kpi label="Revenue today" value={money(k.revenueTodayCents)} />
            <Kpi label="Revenue this week" value={money(k.revenueWeekCents)} />
            <Kpi label="Revenue this month" value={money(k.revenueMonthCents)} />
            <Kpi label="Active memberships" value={String(k.activeMemberships)} />
            <Kpi label="Membership MRR" value={money(k.mrrCents)} />
            <Kpi label="Cancellations" value={String(k.cancellationsToday)} />
            <Kpi label="Refunds" value={String(k.refundsToday)} />
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
        </div>
      </div>
    </PageShell>
  );
}
