import { describe, expect, it } from "vitest";
import type { User } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { adminRouter } from "./routers/admin";

function caller(role: User["role"] | null) {
  const user = role ? ({ id: 42, role } as User) : null;
  return adminRouter.createCaller({ req: {} as TrpcContext["req"], res: {} as TrpcContext["res"], user });
}

describe("private admin operations access", () => {
  it("blocks all new booking, transaction and support read models for non-admin roles", async () => {
    for (const role of [null, "customer", "driver"] as const) {
      const staff = caller(role);
      const calls = [() => staff.bookings({}), () => staff.booking({ id: 1 }), () => staff.payments(),
        () => staff.supportTickets(), () => staff.recentBookings(), () => staff.upcomingDepartures(), () => staff.schedule(),
        () => staff.rescheduleBooking({ bookingId: 1, newOutboundDepartureId: 2, newReturnDepartureId: null,
          outboundSeats: ["2A"], returnSeats: null })];
      for (const call of calls) await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });
});
