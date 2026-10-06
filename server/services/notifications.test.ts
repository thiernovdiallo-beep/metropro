import { describe, expect, it, vi } from "vitest";

const { insert, values, getDb } = vi.hoisted(() => ({
  insert: vi.fn(), values: vi.fn(), getDb: vi.fn(),
}));
vi.mock("../db", () => ({ getDb }));
import { notify, TEMPLATES } from "./notifications";

describe("actual notification delivery", () => {
  it("persists only a real in-app notice for an identified customer", async () => {
    insert.mockReturnValue({ values });
    getDb.mockResolvedValue({ insert });
    insert.mockClear(); values.mockClear();
    await notify({ userId: 42, templateKey: TEMPLATES.booking_confirmation, title: "Confirmed", body: "Test booking" });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith({ userId: 42, channel: "in_app", templateKey: "booking_confirmation", title: "Confirmed", body: "Test booking", payload: null });
  });
  it("does not create fake sent-message rows for guests without an in-app account", async () => {
    insert.mockClear();
    await notify({ userId: null, templateKey: TEMPLATES.boarding_reminder, title: "Boarding", body: "Test" });
    expect(insert).not.toHaveBeenCalled();
  });
});
