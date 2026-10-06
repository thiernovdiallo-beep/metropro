export type SeatPosition = Readonly<{
  seatNumber: string;
  seatType: "standard" | "front";
  row: number;
  column: 0 | 1 | 2; // Eleven-passenger rows: left, middle/aisle, right.
  label: string;
}>;

function makeSeat(seatNumber: string, seatType: SeatPosition["seatType"], row: number, column: SeatPosition["column"]): SeatPosition {
  return { seatNumber, seatType, row, column, label: seatNumber };
}

/** The historical two-column layout remains unchanged for existing departures. */
function buildLegacySeatLayout(capacity: number): readonly SeatPosition[] {
  const seats: SeatPosition[] = [];
  if (capacity >= 2) seats.push(makeSeat("1A", "standard", 1, 0));
  if (capacity >= 1) seats.push(makeSeat("Front", "front", 1, 1));
  for (let row = 2; seats.length < capacity; row += 1) {
    seats.push(makeSeat(`${row}A`, "standard", row, 0));
    if (seats.length < capacity) seats.push(makeSeat(`${row}B`, "standard", row, 1));
  }
  return seats;
}

/** One front seat plus nine standard seats, ordered left-to-right within each row. */
export const SEAT_LAYOUT_10: readonly SeatPosition[] = buildLegacySeatLayout(10);

/** Twelve physical places: one driver and eleven paying passengers.
 * 3M is the extra middle seat; all ten existing passenger seat labels are preserved. */
export const SEAT_LAYOUT_11: readonly SeatPosition[] = [
  makeSeat("1A", "standard", 1, 0),
  makeSeat("Front", "front", 1, 1),
  ...[2, 3, 4, 5].flatMap(row => [
    makeSeat(`${row}A`, "standard", row, 0),
    ...(row === 3 ? [makeSeat("3M", "standard", row, 1)] : []),
    makeSeat(`${row}B`, "standard", row, 2),
  ]),
];

/** Departure capacity counts passengers only; the driver's seat is never for sale. */
export function getSeatLayout(capacity: number): readonly SeatPosition[] {
  if (!Number.isSafeInteger(capacity) || capacity < 0) {
    throw new RangeError("Seat capacity must be a non-negative safe integer");
  }
  if (capacity === 10) return SEAT_LAYOUT_10;
  if (capacity === 11) return SEAT_LAYOUT_11;
  return buildLegacySeatLayout(capacity);
}
