import { describe, expect, it } from "vitest";
import type { User } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { adminProcedure, router } from "./_core/trpc";

const guarded = router({ identity: adminProcedure.query(({ ctx }) => ctx.user.id) });

function caller(role: User["role"] | null) {
  const user = role ? ({ id: 42, role } as User) : null;
  return guarded.createCaller({ req: {} as TrpcContext["req"], res: {} as TrpcContext["res"], user });
}

describe("administrator access", () => {
  it("denies anonymous visitors, customers and drivers", async () => {
    for (const role of [null, "customer", "driver"] as const) {
      await expect(caller(role).identity()).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("permits an existing database administrator role", async () => {
    await expect(caller("admin").identity()).resolves.toBe(42);
  });
});
