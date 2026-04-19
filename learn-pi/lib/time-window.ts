// GIFT: Sensor Module — time-of-day gating for proactive pings.
//
// Pure functions for parsing "HH:MM-HH:MM" window strings and deciding whether
// a given instant falls inside, evaluated against an IANA timezone. Used by
// telegram-gateway to honor active_window / quiet_hours from settings.

export type MinuteOfDay = number;

export function parseWindow(hhmm: string): [MinuteOfDay, MinuteOfDay] {
  const [a, b] = hhmm.split("-");
  return [toMinutes(a), toMinutes(b)];
}

function toMinutes(hhmm: string): MinuteOfDay {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Minute-of-day in a given IANA timezone. Uses Intl.DateTimeFormat so we don't
// need a tz library; `timeZone: undefined` falls back to the host's local zone.
export function minuteOfDayInZone(now: Date, timezone: string | undefined): MinuteOfDay {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || undefined,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  // Intl sometimes returns "24" for midnight in hour12:false — normalize.
  return ((h % 24) * 60) + m;
}

export function inWindow(now: Date, window: string, timezone?: string): boolean {
  const mins = minuteOfDayInZone(now, timezone);
  const [start, end] = parseWindow(window);
  // Wrap-around windows (e.g. "22:00-08:00") pass when either half matches.
  return start <= end ? mins >= start && mins < end : mins >= start || mins < end;
}
