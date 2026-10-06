type TicketLeg = { departureId: number };
type PassengerAssignments = {
  departureId: number | null;
  seatNumber: string | null;
  returnDepartureId: number | null;
  returnSeatNumber: string | null;
};

/** Legacy, unnumbered and rescheduled tickets intentionally return null. */
export function seatNumberForTicket(ticket: TicketLeg, passenger: PassengerAssignments | null | undefined): string | null {
  if (!passenger) return null;
  if (ticket.departureId === passenger.departureId) return passenger.seatNumber;
  if (ticket.departureId === passenger.returnDepartureId) return passenger.returnSeatNumber;
  return null;
}
