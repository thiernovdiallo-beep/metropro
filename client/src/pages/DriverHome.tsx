import { DriverLayout } from "@/layouts/DriverLayout";
import { DriverPortrait } from "@/components/DriverPortrait";
import { ActionLink, PageIntro, ResourceState, StatusBadge } from "@/components/MetroUI";
import { Button } from "@/components/ui/button";
import { formatDate, formatTime } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { ArrowRight, CalendarDays, CarFront } from "lucide-react";
import { Link } from "wouter";

export default function DriverHome() {
  const { isAuthenticated, user } = useAuth();
  const home = trpc.driver.home.useQuery(undefined, {
    enabled: isAuthenticated && (user?.role === "driver" || user?.role === "admin"),
  });

  if (!isAuthenticated) {
    return (
      <DriverLayout>
        <div className="metro-page metro-page--readable">
          <PageIntro
            eyebrow="Driver access"
            title="Driver portal"
            description="Sign in to view your assigned trips, passenger manifests, and boarding tools."
          />
          <section className="ticket-card p-5 sm:p-6" aria-label="Driver sign in">
            <p className="text-sm leading-relaxed text-muted-foreground">Use your approved driver account to continue.</p>
            <Button asChild className="mt-5">
              <Link href="/driver/login">Driver sign in</Link>
            </Button>
          </section>
        </div>
      </DriverLayout>
    );
  }

  const today = home.data?.today;
  const upcoming = home.data?.upcoming ?? [];

  return (
    <DriverLayout>
      <div className="metro-page">
        <PageIntro
          eyebrow="Driver operations"
          title="Driver portal"
          description="Review your assigned departures and open a manifest when it is time to board."
        />

        <ResourceState
          loading={home.isLoading}
          error={home.error?.message}
          onRetry={() => void home.refetch()}
        >
          <>
            {home.data?.profile ? (
              <section id="driver-profile" className="ticket-card mb-8 flex flex-wrap items-center gap-4 p-5 sm:p-6" aria-label="Driver profile">
                <DriverPortrait profileId={home.data.profile.id} name={home.data.profile.fullName} className="h-20 w-20" />
                <div className="min-w-0">
                  <p className="metro-eyebrow">Driver profile</p>
                  <h2 className="font-serif text-2xl font-semibold tracking-tight">{home.data.profile.fullName}</h2>
                  <p className="mt-1 break-words text-sm text-muted-foreground">
                    {home.data.profile.phone ?? "No phone saved"} · {home.data.profile.email}
                  </p>
                  <p className="mt-1 text-xs font-medium text-muted-foreground">
                    {home.data.profile.idLast4 ? `ID ending ${home.data.profile.idLast4}` : "ID pending"}
                  </p>
                </div>
              </section>
            ) : null}

            <section aria-labelledby="today-trip-heading">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="metro-eyebrow">Assigned departure</p>
                  <h2 id="today-trip-heading" className="metro-section-title">Today’s trip</h2>
                </div>
                {today?.departure ? <StatusBadge status={today.departure.status} /> : null}
              </div>

              {today ? (
                <article className="ticket-card mt-4 p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="font-serif text-2xl font-semibold tracking-tight">
                        {today.origin?.name} <span aria-hidden="true">→</span> {today.destination?.name}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        Departure {formatTime(today.departure.departAt)} · Vehicle {today.vehicle?.code} · Passengers {today.passengersBooked}/{today.capacity}
                      </p>
                      {today.stops?.length ? <p className="mt-2 text-xs text-muted-foreground">Via {today.stops.map(stop => stop.location?.label ?? `Stop ${stop.stopOrder}`).join(" · ")}</p> : null}
                    </div>
                    <StatusBadge status={today.departure.status} className="shrink-0" />
                  </div>
                  <ActionLink href={`/driver/trip/${today.departure.id}`} variant="primary" className="mt-5">
                    Open manifest <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </ActionLink>
                </article>
              ) : (
                <div className="mt-4">
                  <ResourceState
                    empty
                    emptyTitle="No trip assigned today"
                    emptyDescription="There is no assigned departure on your schedule today. Check upcoming assignments below."
                  >
                    {null}
                  </ResourceState>
                </div>
              )}
            </section>

            <section id="upcoming-assignments-heading" className="mt-10" aria-labelledby="upcoming-assignments-heading">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />
                <h2 id="upcoming-assignments-heading" className="metro-section-title">Upcoming assignments</h2>
              </div>
              <div className="mt-4">
                <ResourceState
                  empty={!upcoming.length}
                  emptyTitle="No upcoming assignments"
                  emptyDescription="New assigned trips will appear here when they are scheduled."
                >
                  <div className="grid gap-3">
                    {upcoming.map(item => item ? (
                      <Link
                        key={item.departure.id}
                        href={`/driver/trip/${item.departure.id}`}
                        className="ticket-card group flex min-h-24 items-center justify-between gap-4 p-4 no-underline transition-colors hover:border-primary/45 hover:bg-secondary/35"
                      >
                        <div className="min-w-0">
                          <div className="font-serif text-lg font-semibold tracking-tight">
                            {item.origin?.name} <span aria-hidden="true">→</span> {item.destination?.name}
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {formatDate(item.departure.departAt)} · {formatTime(item.departure.departAt)} · {item.vehicle?.code}
                          </p>
                        </div>
                        <ArrowRight className="h-5 w-5 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                      </Link>
                    ) : null)}
                  </div>
                </ResourceState>
              </div>
            </section>

            {home.data?.vehicle ? (
              <section className="ticket-card mt-8 flex items-start gap-3 p-4 text-sm text-muted-foreground" aria-label="Assigned vehicle">
                <CarFront className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <p>Assigned vehicle <span className="font-semibold text-foreground">{home.data.vehicle.code}</span> · {home.data.vehicle.make} {home.data.vehicle.model}</p>
              </section>
            ) : null}
          </>
        </ResourceState>
      </div>
    </DriverLayout>
  );
}
