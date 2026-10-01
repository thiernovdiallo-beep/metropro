import { PageShell } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { formatDate, formatTime, money } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";

function useParams() {
  const search = useSearch();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function SearchResults() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const origin = Number(params.get("origin"));
  const dest = Number(params.get("dest"));
  const date = params.get("date") ?? "";
  const returnDate = params.get("return");
  const pax = Number(params.get("pax") ?? 1);
  const type = params.get("type") ?? "one_way";
  const { user } = useAuth();
  const memberQ = trpc.account.overview.useQuery(undefined, { enabled: Boolean(user) });
  const isMember = memberQ.data?.memberFareEligible ?? false;
  const outbound = trpc.public.search.useQuery(
    { originCityId: origin, destinationCityId: dest, date, passengers: pax, isMember },
    { enabled: Boolean(origin && dest && date) }
  );
  const inbound = trpc.public.search.useQuery(
    { originCityId: dest, destinationCityId: origin, date: returnDate ?? "", passengers: pax, isMember },
    { enabled: type === "round_trip" && Boolean(returnDate) }
  );
  const [outId, setOutId] = useState<number | null>(null);
  const [inId, setInId] = useState<number | null>(null);

  function continueBooking() {
    if (!outId) return;
    const q = new URLSearchParams({
      out: String(outId),
      pax: String(pax),
      type,
    });
    if (inId) q.set("ret", String(inId));
    setLocation(`/book?${q.toString()}`);
  }

  return (
    <PageShell>
      <div className="container py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Choose departure</p>
        <h1 className="mt-2 font-serif text-3xl">Available trips</h1>
        <p className="mt-1 text-muted-foreground">
          {pax} passenger{pax > 1 ? "s" : ""} · {type === "round_trip" ? "Round trip" : "One-way"}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">Nine regular seats and one front seat per van. Select each seat for your passengers on the next screen.</p>
        <h2 className="mt-8 font-serif text-xl">Outbound · {date ? formatDate(date) : ""}</h2>
        <div className="mt-4 grid gap-3">
          {(outbound.data ?? []).map(d => (
            <DepartureCard
              key={d.id}
              d={d}
              pax={pax}
              isMember={isMember}
              selected={outId === d.id}
              onSelect={() => !d.soldOut && setOutId(d.id)}
            />
          ))}
          {outbound.data?.length === 0 ? (
            <p className="text-sm text-muted-foreground">No departures on this date.</p>
          ) : null}
        </div>
        {type === "round_trip" ? (
          <>
            <h2 className="mt-10 font-serif text-xl">Return · {returnDate ? formatDate(returnDate) : ""}</h2>
            <div className="mt-4 grid gap-3">
              {(inbound.data ?? []).map(d => (
                <DepartureCard
                  key={d.id}
                  d={d}
                  pax={pax}
                  isMember={isMember}
                  selected={inId === d.id}
                  onSelect={() => !d.soldOut && setInId(d.id)}
                />
              ))}
            </div>
          </>
        ) : null}
        <div className="mt-8 flex gap-3">
          <Link href="/">
            <Button variant="outline">Back</Button>
          </Link>
          <Button
            className="h-12 px-8"
            disabled={!outId || (type === "round_trip" && !inId)}
            onClick={continueBooking}
          >
            Continue
          </Button>
        </div>
      </div>
    </PageShell>
  );
}

function DepartureCard({
  d,
  pax,
  isMember,
  selected,
  onSelect,
}: {
  d: {
    id: number;
    departAt: Date;
    arriveAt: Date;
    seatsRemaining: number;
    standardSeatsRemaining: number;
    frontSeatAvailable: boolean;
    soldOut: boolean;
    standardFareCents: number;
    memberFareCents: number;
    frontFareCents: number;
    pickup?: { label: string } | null;
    dropoff?: { label: string } | null;
    origin?: { name: string } | null;
    destination?: { name: string } | null;
    memberEarlyAccess?: boolean;
  };
  pax: number;
  isMember: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={d.soldOut}
      className={`ticket-card w-full p-5 text-left ${selected ? "ring-2 ring-accent" : ""} ${d.soldOut ? "opacity-70" : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm text-muted-foreground">
            {d.origin?.name} → {d.destination?.name}
          </div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="font-serif text-2xl">{formatTime(d.departAt)}</span>
            <span className="text-muted-foreground">arrives {formatTime(d.arriveAt)}</span>
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            Pickup {d.pickup?.label} · Drop-off {d.dropoff?.label}
          </div>
        </div>
        <div className="text-right">
          {d.soldOut ? (
            <span className="stamp-soldout">Sold out</span>
          ) : (
            <>
              <div className="text-xs text-muted-foreground">{d.standardSeatsRemaining} regular · {d.frontSeatAvailable ? 1 : 0} front left</div>
              <div className="price-copper text-2xl font-semibold">
                From {money(d.standardSeatsRemaining > 0 ? (isMember ? d.memberFareCents : d.standardFareCents) : d.frontFareCents)}
              </div>
              <div className="text-xs leading-relaxed text-muted-foreground">
                Regular {money(d.standardFareCents)} · Front {money(d.frontFareCents)}<br />
                Member's own regular seat {money(d.memberFareCents)}
              </div>
            </>
          )}
        </div>
      </div>
      {d.memberEarlyAccess ? (
        <p className="mt-2 text-xs font-medium text-accent">Member early access</p>
      ) : null}
    </button>
  );
}
