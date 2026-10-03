import { describe, expect, it } from "vitest";
import type { User } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { adminRouter } from "./routers/admin";
import { driverRouter } from "./routers/driver";
import { createDriverSetupToken, driverSetupTokenHash } from "./services/driver-auth";
import { prepareDriverPrivate } from "./services/driver-private";
import { makeQrToken } from "./services/tickets";

function context(role: User["role"] | null) {
  return { req: {} as TrpcContext["req"], res: {} as TrpcContext["res"],
    user: role ? ({ id: 42, role } as User) : null };
}

const syntheticPng = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(48),
]).toString("base64");

describe("driver account and boarding boundaries", () => {
  it("lets only an administrator invoke driver creation, not a customer, driver or anonymous visitor", async () => {
    for (const role of [null, "customer", "driver"] as const) {
      await expect(adminRouter.createCaller(context(role)).inviteDriver({
        fullName: "Demo Driver", email: "demo@example.test", phone: "5551234567", idNumber: "AB123456",
        photoBase64: syntheticPng,
      })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("prevents customers and anonymous visitors reading or scanning a driver manifest", async () => {
    for (const role of [null, "customer"] as const) {
      await expect(driverRouter.createCaller(context(role)).trip({ departureId: 1 })).rejects.toMatchObject({ code: role ? "FORBIDDEN" : "UNAUTHORIZED" });
      await expect(driverRouter.createCaller(context(role)).scan({ departureId: 1, qrToken: "long-test-token-for-boarding" })).rejects.toMatchObject({ code: role ? "FORBIDDEN" : "UNAUTHORIZED" });
    }
  });

  it("creates one-way setup capabilities with an unpredictable 256-bit token and hashed storage representation", () => {
    const first = createDriverSetupToken();
    const second = createDriverSetupToken();
    expect(first.token).toHaveLength(43);
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.hash).toBe(driverSetupTokenHash(first.token));
    expect(second.token).not.toBe(first.token);
    expect(driverSetupTokenHash("wrong")).toBeNull();
  });

  it("encrypts the ID number and portrait rather than storing a plaintext private detail", () => {
    const profile = prepareDriverPrivate("ZX654321", syntheticPng);
    expect(profile.idLast4).toBe("4321");
    expect(profile.photoMimeType).toBe("image/png");
    expect(profile.idCiphertext).not.toContain("ZX654321");
    expect(profile.photoCiphertext).not.toBe(syntheticPng);
    expect(() => prepareDriverPrivate("x", syntheticPng)).toThrow(/valid driver ID/);
  });

  it("creates a distinct per-passenger QR ticket secret that can be read by the scanner", () => {
    const a = makeQrToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(a).not.toBe(makeQrToken());
  });
});
