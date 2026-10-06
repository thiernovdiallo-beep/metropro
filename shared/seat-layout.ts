export type SeatPosition = Readonly<{
  seatNumber: string;
  seatType: "standard" | "front";
  row: number;
  column: 0 | 1; // 0 = left, 1 = right; rows start at 1
  label: string;
}>;

function makeSeat(seatNumber: string, seatType: SeatPosition["seatType"], row: number, column: 0 | 1): SeatPosition {
  return { seatNumber, seatType, row, column, label: seatNumber };
}

function buildSeatLayout(capacity: number): readonly SeatPosition[] {
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
export const SEAT_LAYOUT_10: readonly SeatPosition[] = buildSeatLayout(10);

/** Extends the same two-column pattern for other capacities (12 adds 6A and 6B). */
export function getSeatLayout(capacity: number): readonly SeatPosition[] {
  if (!Number.isSafeInteger(capacity) || capacity < 0) {
    throw new RangeError("Seat capacity must be a non-negative safe integer");
  }
  return capacity === 10 ? SEAT_LAYOUT_10 : buildSeatLayout(capacity);
}
