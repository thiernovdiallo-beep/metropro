import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ expireStaleHolds: vi.fn() }));
vi.mock("./inventory", () => ({ expireStaleHolds: mocks.expireStaleHolds }));
import { reconcileExpiredHolds } from "./hold-reconciliation";

describe("expired-hold public reconciliation", () => {
  it("shares concurrent work and limits repeated discovery sweeps", async () => {
    mocks.expireStaleHolds.mockResolvedValue({ expired: 0 });
    const now = Date.now();
    await Promise.all([reconcileExpiredHolds(now), reconcileExpiredHolds(now)]);
    expect(mocks.expireStaleHolds).toHaveBeenCalledTimes(1);
    await reconcileExpiredHolds(now + 10_000);
    expect(mocks.expireStaleHolds).toHaveBeenCalledTimes(1);
    await reconcileExpiredHolds(now + 20_000);
    expect(mocks.expireStaleHolds).toHaveBeenCalledTimes(2);
  });
});
