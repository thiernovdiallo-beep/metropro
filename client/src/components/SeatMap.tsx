import { money } from "@/lib/format";
import { getSeatLayout, type SeatPosition } from "@/lib/seatLayout";
import { trpc } from "@/lib/trpc";
import React, { useEffect, useMemo, useState } from "react";

type SeatStatus = "available" | "taken" | "held" | "selected" | "blocked";

type SeatMapProps = {
  departureId: number;
  passengerCount: number;
  /** One entry per passenger, in booking order; null means not yet assigned. */
  selectedSeats: readonly (string | null | undefined)[];
  onSeatSelect: (seatNumber: string, passengerIndex: number) => void;
  onSeatDeselect: (seatNumber: string, passengerIndex: number) => void;
  /** Optional real booking hold expiry. Selection alone does not reserve a seat. */
  holdExpiresAt?: Date | string | number | null;
  /** The enclosing trip section can provide its own outbound/return heading. */
  showHeading?: boolean;
  label?: string;
};

const seatColors: Record<SeatStatus, string> = {
  available: "metro-seat--available hover:brightness-95",
  taken: "metro-seat--taken",
  held: "metro-seat--held",
  selected: "metro-seat--selected",
  blocked: "metro-seat--blocked",
};

const legend: { label: string; status: SeatStatus }[] = [
  { label: "Available", status: "available" },
  { label: "Taken", status: "taken" },
  { label: "Held", status: "held" },
  { label: "Selected", status: "selected" },
  { label: "Blocked", status: "blocked" },
];

function remainingHoldTime(expiresAt: Date | string | number | null | undefined, now: number) {
  if (expiresAt == null) return null;
  const end = new Date(expiresAt).getTime();
  if (!Number.isFinite(end)) return null;
  const seconds = Math.max(0, Math.ceil((end - now) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function nextOpenPassengerIndex(selectedSeats: readonly (string | null | undefined)[], passengerCount: number) {
  for (let index = 0; index < passengerCount; index += 1) {
    if (!selectedSeats[index]) return index;
  }
  return undefined;
}

export default function SeatMap({
  departureId,
  passengerCount,
  selectedSeats,
  onSeatSelect,
  onSeatDeselect,
  holdExpiresAt,
  showHeading = true,
  label,
}: SeatMapProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [tooltipSeat, setTooltipSeat] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const seatMap = trpc.booking.getSeatMap.useQuery(
    { departureId },
    { enabled: Number.isSafeInteger(departureId) && departureId > 0, refetchInterval: 15_000, refetchOnWindowFocus: true }
  );
  const seats = seatMap.data;
  const layout = useMemo(() => getSeatLayout(seats?.length ?? 10), [seats?.length]);
  const seatsByNumber = useMemo(() => new Map(seats?.map(seat => [seat.seatNumber, seat]) ?? []), [seats]);
  const selectedByNumber = useMemo(() => {
    const entries = selectedSeats.slice(0, Math.max(0, passengerCount))
      .map((seatNumber, passengerIndex) => ({ seatNumber, passengerIndex }))
      .filter((entry): entry is { seatNumber: string; passengerIndex: number } => Boolean(entry.seatNumber));
    return new Map(entries.map(({ seatNumber, passengerIndex }) => [seatNumber, passengerIndex]));
  }, [passengerCount, selectedSeats]);
  const rows = useMemo(() => [...new Set(layout.map(seat => seat.row))], [layout]);

  useEffect(() => {
    if (holdExpiresAt == null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [holdExpiresAt]);

  useEffect(() => {
    if (!seats || seatMap.isError) return;
    // A seat may be taken on another device between choosing it and checkout.
    // Keep the parent draft consistent with the latest authoritative map.
    selectedByNumber.forEach((index, number) => {
      if (seatsByNumber.get(number)?.status !== "available") onSeatDeselect(number, index);
    });
  }, [onSeatDeselect, seats, seatsByNumber, selectedByNumber]);

  useEffect(() => {
    if (!tooltipSeat) return;
    const timer = window.setTimeout(() => setTooltipSeat(null), 4500);
    return () => window.clearTimeout(timer);
  }, [tooltipSeat]);

  const timeLeft = remainingHoldTime(holdExpiresAt, now);
  const selectedCount = selectedByNumber.size;
  const nextPassenger = nextOpenPassengerIndex(selectedSeats, passengerCount);

  function selectSeat(seat: SeatPosition) {
    const state = seatsByNumber.get(seat.seatNumber)?.status ?? "blocked";
    const selectedPassenger = selectedByNumber.get(seat.seatNumber);
    if (selectedPassenger !== undefined && state === "available") {
      onSeatDeselect(seat.seatNumber, selectedPassenger);
      setMessage(null);
      setTooltipSeat(null);
      return;
    }
    if (state !== "available") {
      setTooltipSeat(seat.seatNumber);
      setMessage(state === "taken" ? "This seat is taken" : state === "held" ? "This seat is held by another traveler" : "This seat is unavailable");
      return;
    }
    if (nextPassenger === undefined) {
      setMessage(`All ${passengerCount} passenger${passengerCount === 1 ? "" : "s"} have seats. Deselect a seat to change it.`);
      setTooltipSeat(null);
      return;
    }
    onSeatSelect(seat.seatNumber, nextPassenger);
    setMessage(null);
    setTooltipSeat(null);
  }

  function renderSeat(seat: SeatPosition) {
    const info = seatMap.isError ? undefined : seatsByNumber.get(seat.seatNumber);
    const assignedIndex = selectedByNumber.get(seat.seatNumber);
    const state: SeatStatus = !info ? "blocked" : assignedIndex !== undefined && info.status === "available" ? "selected" : info.status;
    const label = seat.seatType === "front" ? "Front passenger seat" : `Seat ${seat.label}`;
    const description = `${label}, ${state}${info ? `, ${money(info.priceCents)}` : ""}${assignedIndex !== undefined && state === "selected" ? `, passenger ${assignedIndex + 1}` : ""}`;
    return (
      <button
        key={seat.seatNumber}
        type="button"
        aria-label={description}
        aria-pressed={state === "selected"}
        aria-disabled={state === "blocked" || state === "taken" || state === "held"}
        aria-describedby={tooltipSeat === seat.seatNumber ? `seat-tooltip-${departureId}` : undefined}
        title={state === "taken" ? "This seat is taken" : state === "held" ? "This seat is held by another traveler" : undefined}
        onClick={() => selectSeat(seat)}
        className={`flex min-h-18 w-full flex-col items-center justify-center rounded-xl border-2 px-1.5 py-2 text-center shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${seatColors[state]}`}
      >
        <span className="text-sm font-bold leading-tight">{seat.label}</span>
        <span className="mt-1 text-xs font-medium leading-tight">{info ? money(info.priceCents) : "—"}</span>
      </button>
    );
  }

  return (
    <section className="ticket-card min-w-0 p-4 sm:p-6" aria-labelledby={showHeading ? `seat-map-title-${departureId}` : undefined} aria-label={showHeading ? undefined : label ?? "Seat map"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {showHeading ? <h2 id={`seat-map-title-${departureId}`} className="font-serif text-xl sm:text-2xl">Choose your seats</h2> : null}
          <p className="mt-1 text-sm text-muted-foreground">{selectedCount} of {passengerCount} passengers assigned</p>
        </div>
        <p className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-foreground" aria-live={timeLeft === "00:00" ? "assertive" : "off"}>
          {timeLeft === null ? "Seats are not held until checkout" : timeLeft === "00:00" ? "Seat hold expired — refresh availability" : `Seats held for ${timeLeft}`}
        </p>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-3 gap-y-2" aria-label="Seat status legend">
        {legend.map(({ label, status }) => (
          <span key={status} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden="true" className={`size-3.5 rounded border ${seatColors[status]}`} />
            {label}
          </span>
        ))}
      </div>

      {seatMap.isLoading ? <div role="status" className="mx-auto mt-5 flex min-h-56 w-full max-w-[320px] items-center justify-center rounded-[2rem] border-2 border-border bg-background px-4 text-center text-sm text-muted-foreground">Loading live seats…</div>
        : !seatMap.isError && seats?.length === 0 ? <div role="status" className="metro-notice mx-auto mt-5 max-w-[320px] text-center">No seats are available for this departure. Please choose another trip or refresh availability.</div>
        : <div className="mx-auto mt-5 w-full max-w-[320px] rounded-[2rem] border-2 border-border bg-background px-3 py-5 shadow-inner sm:px-5">
        <div className="mb-5 flex flex-col items-center gap-1 text-muted-foreground">
          <svg aria-hidden="true" viewBox="0 0 40 40" className="size-8 fill-none stroke-current stroke-2">
            <circle cx="20" cy="20" r="14" />
            <circle cx="20" cy="20" r="3" />
            <path d="M20 6v11M8 26l9-5M32 26l-9-5" />
          </svg>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">Driver · front</span>
        </div>
        <div className="space-y-3" role="group" aria-label="Van seats, front to back">
          {rows.map(row => {
            const left = layout.find(seat => seat.row === row && seat.column === 0);
            const right = layout.find(seat => seat.row === row && seat.column === 1);
            return (
              <div key={row} role="group" aria-label={row === 1 ? "Front passenger row" : `Row ${row}`}
                className={row === 1 ? "rounded-2xl border border-border bg-white p-2" : ""}>
                {row === 1 ? <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Front row</p> : null}
                <div className="grid grid-cols-[minmax(0,1fr)_2.25rem_minmax(0,1fr)] items-center">
                  {left ? renderSeat(left) : <span aria-hidden="true" />}
                  <span aria-hidden="true" className="text-center text-[10px] font-medium text-muted-foreground">aisle</span>
                  {right ? renderSeat(right) : <span aria-hidden="true" />}
                </div>
              </div>
            );
          })}
        </div>
        {seatMap.isError ? (
          <div role="alert" className="mt-4 text-center text-sm text-destructive">
            Seat availability could not be loaded. <button type="button" onClick={() => void seatMap.refetch()} className="font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2">Try again</button>
          </div>
        ) : null}
      </div>}

      {tooltipSeat && message ? (
        <p id={`seat-tooltip-${departureId}`} role="tooltip" className="mx-auto mt-3 max-w-[320px] rounded-lg border border-border bg-card px-3 py-2 text-center text-sm shadow-sm">{message}</p>
      ) : message ? <p role="status" className="mt-3 text-sm text-muted-foreground">{message}</p> : null}

      <div className="mt-6 border-t border-border pt-4">
        <h3 className="text-sm font-semibold">Passenger seats</h3>
        <ol className="mt-3 grid gap-2 sm:grid-cols-2">
          {Array.from({ length: Math.max(0, passengerCount) }, (_, index) => {
            const number = selectedSeats[index];
            return (
              <li key={index} className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
                <span className="min-w-0 truncate">Passenger {index + 1} <span className="text-muted-foreground">·</span> <strong>{number || "Choose a seat"}</strong></span>
                {number ? (
                  <button type="button" aria-label={`Remove seat ${number} from passenger ${index + 1}`} onClick={() => onSeatDeselect(number, index)} className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 text-xs font-semibold text-primary underline underline-offset-4 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2">Remove</button>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Prices shown are standard one-way fares; eligible member pricing is calculated at checkout. Selecting a seat does not reserve it until checkout creates a hold.</p>
    </section>
  );
}
