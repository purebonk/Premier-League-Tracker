import { describe, it, expect } from "vitest";
import { recentWindow, seasonDateRange } from "./espn";

describe("recentWindow", () => {
  it("is -3/+10 against the UTC date, not the local one", () => {
    // Real case from workflow run #22: started 2026-08-13T04:10:36Z, which is
    // 2026-08-12 21:10 PDT. The window is anchored to the UTC date (Aug 13),
    // so it reads as -2/+11 from Vancouver and -3/+10 in UTC.
    const now = new Date("2026-08-13T04:10:36Z");
    expect(recentWindow(3, 10, now)).toBe("20260810-20260823");
  });

  it("crosses month and year boundaries correctly", () => {
    expect(recentWindow(3, 10, new Date("2026-01-01T12:00:00Z"))).toBe(
      "20251229-20260111",
    );
    expect(recentWindow(3, 10, new Date("2026-03-01T00:00:00Z"))).toBe(
      "20260226-20260311",
    );
  });

  it("zero-pads single digit months and days", () => {
    expect(recentWindow(1, 1, new Date("2026-09-05T12:00:00Z"))).toBe(
      "20260904-20260906",
    );
  });
});

describe("seasonDateRange", () => {
  it("spans July to June so a season is never split across the range", () => {
    expect(seasonDateRange(2025)).toBe("20250701-20260630");
  });
});
