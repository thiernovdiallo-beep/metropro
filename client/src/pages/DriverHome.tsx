import { PageShell } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { formatDate, formatTime } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";
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
          <Button className="mt-4" onClick={() => startLogin()}>
            Sign in
          </Button>
        </div>
      </PageShell>
    );
  }
  const today = home.data?.today;
  return (
    <PageShell>
      <div className="container py-10">
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
