// Unit tests for time-window. Run with `npm test` (vitest).

import { describe, expect, it } from "vitest";
import { inWindow, minuteOfDayInZone, parseWindow } from "./time-window.ts";

// A fixed UTC instant we reuse across cases: 2026-04-19 14:30 UTC.
const INSTANT = new Date("2026-04-19T14:30:00.000Z");

describe("parseWindow", () => {
  it("parses HH:MM-HH:MM to minute-of-day pair", () => {
    expect(parseWindow("09:00-21:00")).toEqual([540, 1260]);
    expect(parseWindow("22:00-08:00")).toEqual([1320, 480]);
  });
});

describe("minuteOfDayInZone", () => {
  it("reads wall-clock minute-of-day in the given zone", () => {
    // 14:30 UTC → 16:30 in Berlin (CEST, UTC+2) → 16*60+30 = 990.
    expect(minuteOfDayInZone(INSTANT, "Europe/Berlin")).toBe(990);
    // 14:30 UTC → 07:30 in Los Angeles (PDT, UTC-7) → 7*60+30 = 450.
    expect(minuteOfDayInZone(INSTANT, "America/Los_Angeles")).toBe(450);
  });

  it("falls back to host-local when timezone is empty/undefined", () => {
    // We can't assert a specific value (depends on host TZ), but it must be a
    // valid minute-of-day in [0, 1440).
    const mins = minuteOfDayInZone(INSTANT, undefined);
    expect(mins).toBeGreaterThanOrEqual(0);
    expect(mins).toBeLessThan(1440);
  });
});

describe("inWindow", () => {
  it("forward window: inside passes, outside fails", () => {
    // 09:00-21:00 in Berlin. 14:30 UTC is 16:30 Berlin → inside.
    expect(inWindow(INSTANT, "09:00-21:00", "Europe/Berlin")).toBe(true);
    // 09:00-21:00 in LA. 14:30 UTC is 07:30 LA → outside.
    expect(inWindow(INSTANT, "09:00-21:00", "America/Los_Angeles")).toBe(false);
  });

  it("wrap-around window (quiet_hours) passes across midnight", () => {
    // 22:00-08:00 in LA. 14:30 UTC is 07:30 LA → inside the tail.
    expect(inWindow(INSTANT, "22:00-08:00", "America/Los_Angeles")).toBe(true);
    // 22:00-08:00 in Berlin. 14:30 UTC is 16:30 Berlin → outside.
    expect(inWindow(INSTANT, "22:00-08:00", "Europe/Berlin")).toBe(false);
  });

  it("boundary: start inclusive, end exclusive", () => {
    // Berlin 09:00 exactly.
    const at0900Berlin = new Date("2026-04-19T07:00:00.000Z");
    expect(inWindow(at0900Berlin, "09:00-21:00", "Europe/Berlin")).toBe(true);
    // Berlin 21:00 exactly → end is exclusive, so outside.
    const at2100Berlin = new Date("2026-04-19T19:00:00.000Z");
    expect(inWindow(at2100Berlin, "09:00-21:00", "Europe/Berlin")).toBe(false);
  });
});
