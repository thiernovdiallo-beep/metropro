import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSeatLayout, type SeatPosition } from "../lib/seatLayout";
import SeatMap, { nextOpenPassengerIndex } from "./SeatMap";

const mock = vi.hoisted(() => ({
  seats: [] as { seatNumber: string; seatType: "standard" | "front"; status: "available" | "taken" | "held"; priceCents: number }[],
  isLoading: false,
  isError: false,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: { booking: { getSeatMap: { useQuery: () => ({ data: mock.seats, isLoading: mock.isLoading, isError: mock.isError, refetch: vi.fn() }) } } },
}));

const render = (selectedSeats: (string | null)[] = [], holdExpiresAt?: Date) => renderToStaticMarkup(createElement(SeatMap, {
  departureId: 7, passengerCount: 2, selectedSeats,
  onSeatSelect: vi.fn(), onSeatDeselect: vi.fn(), holdExpiresAt,
}));

beforeEach(() => {
  mock.seats = getSeatLayout(10).map((seat: SeatPosition) => ({
    seatNumber: seat.seatNumber,
    seatType: seat.seatType,
    status: seat.seatNumber === "Front" ? "held" : seat.seatNumber === "2A" ? "taken" : "available",
    priceCents: seat.seatType === "front" ? 20000 : 15000,
  }));
  mock.isError = false;
  mock.isLoading = false;
});

describe("standalone SeatMap", () => {
  it("assigns the next open passenger slot and caps assignments at passengerCount", () => {
    expect(nextOpenPassengerIndex([], 2)).toBe(0);
    expect(nextOpenPassengerIndex(["1A", null], 2)).toBe(1);
    expect(nextOpenPassengerIndex(["1A", "2B"], 2)).toBeUndefined();
    expect(nextOpenPassengerIndex([], 0)).toBeUndefined();
  });

  it("renders the driver, separate front row, aisle, five legend states, prices and accessible buttons", () => {
    const html = render(["1A", null]);
    expect(html).toContain("Driver · front");
    expect(html).toContain("Front passenger row");
    expect(html).toContain("aisle");
    for (const status of ["Available", "Taken", "Held", "Selected", "Blocked"]) expect(html).toContain(status);
    expect(html).toContain("$150");
    expect(html).toContain("$200");
    expect(html).toContain('aria-label="Seat 1A, selected, $150, passenger 1"');
    expect(html).toContain('aria-label="Front passenger seat, held, $200"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain("Passenger 2");
    expect(html).toContain("Choose a seat");
  });

  it("uses grey blocked seats for missing live data and prevents false hold countdowns", () => {
    mock.seats = mock.seats.map(seat => seat.seatNumber === "5B" ? { ...seat, seatNumber: "Unknown" } : seat);
    const html = render();
    expect(html).toContain('aria-label="Seat 5B, blocked"');
    expect(html).toContain("Seats are not held until checkout");
    expect(html).not.toContain("Seats held for");
  });

  it("shows a countdown only when a real hold expiry is supplied", () => {
    const html = render([], new Date(Date.now() + 9 * 60_000));
    expect(html).toMatch(/Seats held for 09:0[01]/);
  });

  it("blocks stale seat data and offers a retry when availability fails", () => {
    mock.isError = true;
    const html = render();
    expect(html).toContain('aria-label="Seat 1A, blocked"');
    expect(html).toContain("Seat availability could not be loaded");
    expect(html).toContain("Try again");
  });

  it("shows a real loading state instead of falsely rendering blocked seat buttons", () => {
    mock.isLoading = true;
    mock.seats = [];
    const html = render();
    expect(html).toContain("Loading live seats…");
    expect(html).not.toContain('aria-label="Seat 2A, blocked"');
  });

  it("shows an explicit no-seats state for an empty authoritative map", () => {
    mock.seats = [];
    const html = render();
    expect(html).toContain("No seats are available for this departure");
    expect(html).not.toContain('aria-label="Seat 2A, blocked"');
  });
});
