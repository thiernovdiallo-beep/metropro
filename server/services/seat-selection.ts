import { TRPCError } from "@trpc/server";
import type { SeatAvailability } from "./seat-inventory";
import type { SeatSelection } from "./pricing";

type NumberedPassenger = SeatSelection & { seatNumber?: string; returnSeatNumber?: string };

/** Validate the selected seats for a single leg against a fresh departure layout. */
export function validateNumberedSeats(
  seats: SeatAvailability[],
  passengers: NumberedPassenger[],
  leg: "outbound" | "return"
) {
  const byNumber = new Map(seats.map(seat => [seat.seatNumber, seat]));
  const selected = new Set<string>();
  for (const passenger of passengers) {
    const number = leg === "outbound" ? passenger.seatNumber : passenger.returnSeatNumber;
    if (!number) continue; // Legacy, quantity-only passenger.
    const seat = byNumber.get(number);
    if (!seat) throw new TRPCError({ code: "BAD_REQUEST", message: `Seat ${number} is not in this vehicle's layout.` });
    if (selected.has(number)) throw new TRPCError({ code: "BAD_REQUEST", message: `Seat ${number} was selected more than once.` });
    selected.add(number);
    const type = leg === "outbound" ? passenger.outboundSeatType : passenger.returnSeatType;
    if (seat.seatType !== type) throw new TRPCError({ code: "BAD_REQUEST", message: `Seat ${number} does not match its selected fare type.` });
    if (seat.status !== "available") throw new TRPCError({ code: "CONFLICT", message: `Seat ${number} is no longer available.` });
  }
}
