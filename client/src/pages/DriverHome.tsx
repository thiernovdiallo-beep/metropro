import { PageShell } from "@/components/Brand";
import { DriverPortrait } from "@/components/DriverPortrait";
import { Button } from "@/components/ui/button";
import { formatDate, formatTime } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link } from "wouter";

export default function DriverHome() {
  const { isAuthenticated, user } = useAuth();
  const home = trpc.driver.home.useQuery(undefined, {
    enabled: isAuthenticated && (user?.role === "driver" || user?.role === "admin"),
  });
  if (!isAuthenticated) {
    return (
      <PageShell>
        <div className="container py-16">
          <h1 className="font-serif text-3xl">Driver portal</h1>
          <Link href="/driver/login"><Button className="mt-4">Driver sign in</Button></Link>
        </div>
      </PageShell>
    );
  }
  const today = home.data?.today;
  return (
    <PageShell>
      <div className="container py-10">
        {home.data?.profile ? <section className="ticket-card mb-7 flex flex-wrap items-center gap-4 p-5">
          <DriverPortrait profileId={home.data.profile.id} name={home.data.profile.fullName} className="h-20 w-20" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Driver profile</p>
            <h1 className="font-serif text-2xl">{home.data.profile.fullName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{home.data.profile.phone ?? "No phone saved"} · {home.data.profile.email}</p>
            <p className="text-xs text-muted-foreground">{home.data.profile.idLast4 ? `ID ending ${home.data.profile.idLast4}` : "ID pending"}</p>
          </div>
        </section> : null}
        <h1 className="font-serif text-3xl">Today’s trip</h1>
        {today ? (
          <div className="ticket-card mt-5 p-5">
            <div className="text-xl font-semibold">
              {today.origin?.name} → {today.destination?.name}
            </div>
            <div className="mt-1 text-muted-foreground">
              Departure {formatTime(today.departure.departAt)} · Vehicle {today.vehicle?.code} ·
              Passengers {today.passengersBooked}/{today.capacity}
            </div>
            <Link href={`/driver/trip/${today.departure.id}`}>
              <Button className="mt-4">Open manifest</Button>
            </Link>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">No trip assigned today.</p>
        )}
        <h2 className="mt-10 font-serif text-xl">Upcoming assignments</h2>
        <div className="mt-3 grid gap-2">
          {(home.data?.upcoming ?? []).map(item =>
            item ? (
              <Link
                key={item.departure.id}
                href={`/driver/trip/${item.departure.id}`}
                className="ticket-card block p-4"
              >
                {item.origin?.name} → {item.destination?.name} · {formatDate(item.departure.departAt)}{" "}
                {formatTime(item.departure.departAt)} · {item.vehicle?.code}
              </Link>
            ) : null
          )}
        </div>
        {home.data?.vehicle ? (
          <div className="mt-8 text-sm text-muted-foreground">
            Assigned vehicle {home.data.vehicle.code} · {home.data.vehicle.make} {home.data.vehicle.model}
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}
