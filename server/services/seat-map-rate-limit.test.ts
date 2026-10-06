import { describe, expect, it } from "vitest";
import { createSeatMapRateLimiter } from "./seat-map-rate-limit";

describe("public seat-map rate limiter", () => {
  it("rejects repeated requests from one caller while leaving another caller available", () => {
    const throttle = createSeatMapRateLimiter({ windowMs: 1_000, perClientLimit: 2, globalLimit: 4 });
    throttle("guest:first", 100);
    throttle("guest:first", 101);
    expect(() => throttle("guest:first", 102)).toThrow();
    expect(() => throttle("guest:second", 103)).not.toThrow();
  });

  it("caps total requests, then resets both limits at the next window", () => {
    const throttle = createSeatMapRateLimiter({ windowMs: 1_000, perClientLimit: 2, globalLimit: 3 });
    throttle("guest:first", 100);
    throttle("guest:second", 101);
    throttle("guest:third", 102);
    expect(() => throttle("guest:fourth", 103)).toThrow();
    expect(() => throttle("guest:first", 1_100)).not.toThrow();
  });
});
