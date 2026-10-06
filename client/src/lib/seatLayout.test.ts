import { describe, expect, it } from "vitest";
import { getSeatLayout, SEAT_LAYOUT_10, SEAT_LAYOUT_11, type SeatPosition } from "./seatLayout";
import { getSeatLayout as getServerLayout, SEAT_LAYOUT_10 as SERVER_SEAT_LAYOUT_10, SEAT_LAYOUT_11 as SERVER_SEAT_LAYOUT_11 } from "../../../server/services/seat-layout";

describe("shared passenger-van seat layout", () => {
  it("places the front seat to the right of 1A and standard seats in rows 2–5", () => {
    expect(SEAT_LAYOUT_10).toEqual([
      { seatNumber: "1A", seatType: "standard", row: 1, column: 0, label: "1A" },
      { seatNumber: "Front", seatType: "front", row: 1, column: 1, label: "Front" },
      ...[2, 3, 4, 5].flatMap(row => [
        { seatNumber: `${row}A`, seatType: "standard", row, column: 0, label: `${row}A` },
        { seatNumber: `${row}B`, seatType: "standard", row, column: 1, label: `${row}B` },
      ]),
    ]);
    expect(SEAT_LAYOUT_10).toHaveLength(10);
    expect(SEAT_LAYOUT_10.filter((seat: SeatPosition) => seat.seatType === "standard")).toHaveLength(9);
    expect(getSeatLayout(10)).toBe(SEAT_LAYOUT_10);
  });

  it("extends a twelve-seat van with regular seats 6A and 6B", () => {
    const layout = getSeatLayout(12);
    expect(layout).toHaveLength(12);
    expect(layout.slice(0, 10)).toEqual(SEAT_LAYOUT_10);
    expect(layout.slice(-2)).toEqual([
      { seatNumber: "6A", seatType: "standard", row: 6, column: 0, label: "6A" },
      { seatNumber: "6B", seatType: "standard", row: 6, column: 1, label: "6B" },
    ]);
    expect(new Set(layout.map((seat: SeatPosition) => seat.seatNumber)).size).toBe(12);
  });

  it("adds exactly one center passenger seat to a twelve-place van, preserving every existing ticket label", () => {
    expect(getSeatLayout(11)).toBe(SEAT_LAYOUT_11);
    expect(SEAT_LAYOUT_11).toHaveLength(11);
    expect(SEAT_LAYOUT_11.filter(seat => seat.seatType === "front")).toHaveLength(1);
    expect(SEAT_LAYOUT_11.filter(seat => seat.seatType === "standard")).toHaveLength(10);
    expect(SEAT_LAYOUT_11.map(seat => seat.seatNumber)).toEqual(["1A", "Front", "2A", "2B", "3A", "3M", "3B", "4A", "4B", "5A", "5B"]);
    for (const seat of SEAT_LAYOUT_10) {
      expect(SEAT_LAYOUT_11.some(next => next.seatNumber === seat.seatNumber && next.seatType === seat.seatType)).toBe(true);
    }
    expect(SEAT_LAYOUT_11.find(seat => seat.seatNumber === "3M")).toMatchObject({ row: 3, column: 1, seatType: "standard" });
    expect(new Set(SEAT_LAYOUT_11.map(seat => `${seat.row}:${seat.column}`)).size).toBe(11);
  });

  it("supports other non-negative capacities and rejects invalid input", () => {
    expect(getSeatLayout(0)).toEqual([]);
    expect(getSeatLayout(1)).toEqual([{ seatNumber: "Front", seatType: "front", row: 1, column: 1, label: "Front" }]);
    expect(getSeatLayout(3).map((seat: SeatPosition) => seat.seatNumber)).toEqual(["1A", "Front", "2A"]);
    expect(getSeatLayout(11).find(seat => seat.seatNumber === "3M")?.label).toBe("3M");
    expect(() => getSeatLayout(-1)).toThrow(RangeError);
    expect(() => getSeatLayout(10.5)).toThrow(RangeError);
    expect(() => getSeatLayout(Number.NaN)).toThrow(RangeError);
  });

  it("uses exactly the same source from client and server", () => {
    expect(SERVER_SEAT_LAYOUT_10).toBe(SEAT_LAYOUT_10);
    expect(SERVER_SEAT_LAYOUT_11).toBe(SEAT_LAYOUT_11);
    expect(getServerLayout(11)).toEqual(getSeatLayout(11));
    expect(getServerLayout(12)).toEqual(getSeatLayout(12));
  });
});
