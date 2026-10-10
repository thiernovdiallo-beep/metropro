import { CustomerLayout } from "@/layouts/CustomerLayout";
import { ActionLink, BookingProgress, PageIntro, ResourceState, StatusBadge, StatusNotice } from "@/components/MetroUI";
import SeatMap from "@/components/SeatMap";
import { Button } from "@/components/ui/button";
import { formatDate, formatTime, money } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useCallback, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";

type SeatChoice = { seatNumber: string; seatType: "standard" | "front"; status: "available" | "held" | "taken"; priceCents: number };
type ExistingDraft = { out: string | null; ret: string | null; pax: string; passengers?: { firstName: string; lastName: string; seatNumber?: string; returnSeatNumber?: string; isMemberTraveler: boolean }[]; contactFirstName?: string; contactLastName?: string; phone?: string; email?: string; emergencyName?: string; emergencyPhone?: string };

function initialDraft(out: number, ret: number, pax: number): ExistingDraft | null {
  try {
    const raw = sessionStorage.getItem("metropro-booking");
    const draft = raw ? JSON.parse(raw) as ExistingDraft : null;
    return draft && Number(draft.out) === out && Number(draft.ret) === ret && Number(draft.pax) === pax ? draft : null;
  } catch { return null; }
}

export function seatsReadyForLeg(selection: readonly (string | undefined)[], map: readonly SeatChoice[] | undefined, count: number) {
  if (!map || selection.length !== count || selection.some(seat => !seat) || new Set(selection).size !== count) return false;
  return selection.every(number => map.some(seat => seat.seatNumber === number && seat.status === "available"));
}

export default function SeatSelection() {
  const search = useSearch();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const [, setLocation] = useLocation();
  const out = Number(params.get("out"));
  const ret = Number(params.get("ret"));
  const requestedPax = Number(params.get("pax") ?? 1);
  const valid = out > 0 && Number.isInteger(requestedPax) && requestedPax >= 1 && requestedPax <= 11;
  const pax = valid ? requestedPax : 1;
  const previous = useMemo(() => valid ? initialDraft(out, ret, pax) : null, [out, ret, pax, valid]);
  const [outSeats, setOutSeats] = useState<(string | undefined)[]>(() => Array.from({ length: pax }, (_, index) => previous?.passengers?.[index]?.seatNumber));
  const [retSeats, setRetSeats] = useState<(string | undefined)[]>(() => Array.from({ length: pax }, (_, index) => previous?.passengers?.[index]?.returnSeatNumber));
  const outbound = trpc.public.departure.useQuery({ id: out }, { enabled: valid });
  const inbound = trpc.public.departure.useQuery({ id: ret }, { enabled: valid && ret > 0 });
  const outMap = trpc.booking.getSeatMap.useQuery({ departureId: out }, { enabled: valid, refetchInterval: 15_000, refetchOnWindowFocus: true });
  const retMap = trpc.booking.getSeatMap.useQuery({ departureId: ret }, { enabled: valid && ret > 0, refetchInterval: 15_000, refetchOnWindowFocus: true });
  const selectOut = useCallback((seat: string, index: number) => setOutSeats(list => list.map((current, i) => i === index ? seat : current)), []);
  const removeOut = useCallback((seat: string, index: number) => setOutSeats(list => list.map((current, i) => i === index && current === seat ? undefined : current)), []);
  const selectRet = useCallback((seat: string, index: number) => setRetSeats(list => list.map((current, i) => i === index ? seat : current)), []);
  const removeRet = useCallback((seat: string, index: number) => setRetSeats(list => list.map((current, i) => i === index && current === seat ? undefined : current)), []);
  const ready = valid && seatsReadyForLeg(outSeats, outMap.data, pax) && (!ret || seatsReadyForLeg(retSeats, retMap.data, pax));
  const estimate = outSeats.reduce((total, number) => total + (outMap.data?.find(seat => seat.seatNumber === number)?.priceCents ?? 0), 0) +
    (ret ? retSeats.reduce((total, number) => total + (retMap.data?.find(seat => seat.seatNumber === number)?.priceCents ?? 0), 0) : 0);
  const back = `/trip?${params}`;
  const loading = outbound.isLoading || outMap.isLoading || Boolean(ret && (inbound.isLoading || retMap.isLoading));

  function continueToPassengers() {
    if (!ready) return;
    const people = Array.from({ length: pax }, (_, index) => {
      const before = previous?.passengers?.[index];
      return {
        firstName: before?.firstName ?? "", lastName: before?.lastName ?? "",
        seatNumber: outSeats[index], returnSeatNumber: ret ? retSeats[index] : undefined,
        outboundSeatType: outMap.data!.find(seat => seat.seatNumber === outSeats[index])!.seatType,
        returnSeatType: ret ? retMap.data!.find(seat => seat.seatNumber === retSeats[index])!.seatType : null,
        isMemberTraveler: before?.isMemberTraveler ?? false,
      };
    });
    sessionStorage.setItem("metropro-booking", JSON.stringify({ ...previous, out: String(out), ret: ret ? String(ret) : null, pax: String(pax), type: ret ? "round_trip" : "one_way", passengers: people }));
    setLocation(`/book?${params}`);
  }

  return <CustomerLayout><main className="metro-page metro-page--wide pb-28 lg:pb-20">
    <BookingProgress current="Seats" />
    <PageIntro eyebrow="Your trip · Step 3" title="Select your seat" description="Seats are selected for passenger 1, passenger 2, and so on. No seat is held until secure checkout creates your booking." />
    {outbound.data ? <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><span>{outbound.data.origin?.name} → {outbound.data.destination?.name} · {formatDate(outbound.data.departAt)} · {formatTime(outbound.data.departAt)} · {outbound.data.vehicleCode ? `Service ${outbound.data.vehicleCode}` : "Vehicle assignment pending"}</span><StatusBadge status="pending" label="Choose seats" /></div> : null}
    {!valid || outbound.error || inbound.error || outMap.error || retMap.error ? <StatusNotice tone="error" className="mb-6">Trip or seat information could not be loaded. <ActionLink href={back} back className="ml-2 align-middle">Return to trip details</ActionLink></StatusNotice> : null}
    {valid && loading ? <div className="mb-6"><ResourceState loading>Loading current seat availability…</ResourceState></div> : null}
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="min-w-0 space-y-7">
        {valid ? <section aria-label="Outbound seats"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="metro-section-title">Outbound seats</h2><StatusBadge status={outSeats.filter(Boolean).length === pax ? "available" : "pending"} label={`${outSeats.filter(Boolean).length}/${pax} selected`} /></div><SeatMap departureId={out} passengerCount={pax} selectedSeats={outSeats} onSeatSelect={selectOut} onSeatDeselect={removeOut} showHeading={false} label="Outbound seat map" /></section> : null}
        {valid && ret ? <section aria-label="Return seats"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="metro-section-title">Return seats · {inbound.data ? formatDate(inbound.data.departAt) : "Loading"}</h2><StatusBadge status={retSeats.filter(Boolean).length === pax ? "available" : "pending"} label={`${retSeats.filter(Boolean).length}/${pax} selected`} /></div><SeatMap departureId={ret} passengerCount={pax} selectedSeats={retSeats} onSeatSelect={selectRet} onSeatDeselect={removeRet} showHeading={false} label="Return seat map" /></section> : null}
        <ActionLink href={back} back>Back to trip details</ActionLink>
      </div>
      <aside className="ticket-card sticky top-24 hidden space-y-4 p-5 lg:block" aria-label="Selected trip summary"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-serif text-xl">Your selection</h2><StatusBadge status={ready ? "available" : "pending"} label={ready ? "Seats selected" : "Selection in progress"} /></div>
        <p className="text-sm">{outbound.data?.origin?.name} → {outbound.data?.destination?.name}</p>
        <p className="text-sm">{pax} passenger{pax === 1 ? "" : "s"}</p>
        <ol className="space-y-1 text-sm">{outSeats.map((seat, index) => <li key={index}>Passenger {index + 1}: {seat ? `Seat ${seat}` : "Choose a seat"}{ret ? ` · Return ${retSeats[index] ?? "not selected"}` : ""}</li>)}</ol>
        <div className="border-t border-border pt-3 text-sm"><p>Regular-fare estimate <strong>{money(estimate)}</strong></p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Exact member pricing and total are calculated at review.</p></div>
        <Button className="min-h-12 w-full" disabled={!ready} onClick={continueToPassengers}>Continue to passenger details</Button>
      </aside>
    </div>
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,.08)] backdrop-blur lg:hidden"><div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3"><div className="min-w-0 text-sm"><strong>{outSeats.filter(Boolean).length}/{pax} outbound seats</strong>{ret ? <p className="text-xs text-muted-foreground">{retSeats.filter(Boolean).length}/{pax} return · Estimate {money(estimate)}</p> : <p className="text-xs text-muted-foreground">Estimate {money(estimate)}</p>}</div><Button className="min-h-11 shrink-0" disabled={!ready} onClick={continueToPassengers}>Continue</Button></div></div>
  </main></CustomerLayout>;
}
