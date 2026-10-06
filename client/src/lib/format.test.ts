import { describe, expect, it } from "vitest";
import { formatDate, formatTime, isoDate, parseServiceDateTimeInput, serviceDateTimeInput } from "./format";

describe("NYC–Columbus Eastern departure clock", () => {
  it("keeps searched date-only values on the selected travel day", () => {
    expect(formatDate("2026-10-07")).toContain("Oct 7");
    expect(isoDate(new Date("2026-10-07T02:00:00Z"))).toBe("2026-10-06");
  });
  it("displays unambiguous ET trip times independent of visitor timezone", () => {
    expect(formatTime(new Date("2026-10-07T14:00:00Z"))).toMatch(/10:00 AM EDT/);
    expect(formatTime(new Date("2026-12-07T15:00:00Z"))).toMatch(/10:00 AM EST/);
  });
  it("converts schedule inputs to the corresponding UTC instants", () => {
    expect(parseServiceDateTimeInput("2026-10-07T10:00")?.toISOString()).toBe("2026-10-07T14:00:00.000Z");
    expect(serviceDateTimeInput(new Date("2026-10-07T14:00:00Z"))).toBe("2026-10-07T10:00");
    expect(parseServiceDateTimeInput("2026-12-07T10:00")?.toISOString()).toBe("2026-12-07T15:00:00.000Z");
  });
  it("rejects nonexistent spring-forward and impossible local dates while resolving fall-back to the earlier instant", () => {
    expect(parseServiceDateTimeInput("2026-03-08T02:30")).toBeNull();
    expect(parseServiceDateTimeInput("2026-02-30T10:00")).toBeNull();
    expect(parseServiceDateTimeInput("2026-11-01T01:30")?.toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });
});
