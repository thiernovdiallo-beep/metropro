import { describe, expect, it, vi } from "vitest";
import { inventoryTransaction } from "./inventory";

describe("inventory transaction deadlock handling", () => {
  it("retries a rolled-back MySQL deadlock and succeeds with one committed result", async () => {
    const transaction = vi.fn().mockRejectedValueOnce(Object.assign(new Error("deadlock"), { code: "ER_LOCK_DEADLOCK", errno: 1213 }))
      .mockImplementation(async (run: () => Promise<string>) => run());
    const run = vi.fn().mockResolvedValue("committed");
    expect(await inventoryTransaction({ transaction } as never, run)).toBe("committed");
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("never retries a conflict or a durable database error", async () => {
    const error = Object.assign(new Error("seat was taken"), { code: "ER_DUP_ENTRY" });
    const transaction = vi.fn().mockRejectedValue(error);
    await expect(inventoryTransaction({ transaction } as never, vi.fn())).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
