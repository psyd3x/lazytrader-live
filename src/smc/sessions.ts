/**
 * ICT Session and Killzone Classification
 *
 * Maps a UTC timestamp to the active ICT session and killzone using the
 * exact schedule from the Pine indicator's getKillzone() (NY local time,
 * America/New_York, with DST automatic).
 *
 * Source: psyd3x/lazytrader@feat/opendeedee-integration src/smc_engine/sessions.py
 *
 * Pine reference (verbatim, all in minutes-from-midnight ET):
 *   asianKzStart  = 20 * 60          // 20:00
 *   asianKzEnd    = 24 * 60          // 24:00
 *   londonKzStart = 2 * 60           // 02:00
 *   londonKzEnd   = 5 * 60           // 05:00
 *   nyAmKzStart   = 9 * 60 + 30      // 09:30
 *   nyAmKzEnd     = 11 * 60          // 11:00
 *   nyLunchStart  = 12 * 60          // 12:00
 *   nyLunchEnd    = 13 * 60          // 13:00
 *   nyPmKzStart   = 13 * 60 + 30     // 13:30
 *   nyPmKzEnd     = 16 * 60          // 16:00
 *
 * Sessions:
 *   Asia:     20:00 ET prev day - 04:00 ET
 *   London:   03:00 ET - 12:00 ET
 *   New York: 08:00 ET - 17:00 ET
 *
 * TZ conversion uses Intl.DateTimeFormat with timeZone "America/New_York".
 * Node 20+ / Hermes / modern V8 ship full ICU which handles DST correctly.
 * Verified against the Python zoneinfo behavior in unit tests.
 */

export const Session = {
  ASIA: "ASIA",
  LONDON: "LONDON",
  NEW_YORK: "NEW YORK",
  /** Rare gap windows when no session is active. */
  OFF_HOURS: "OFF HOURS",
} as const;
export type Session = (typeof Session)[keyof typeof Session];

export const Killzone = {
  ASIA_KZ: "ASIA KZ",
  LONDON_KZ: "LONDON KZ",
  NY_AM_KZ: "NY AM KZ",
  NY_LUNCH: "NY LUNCH",
  NY_PM_KZ: "NY PM KZ",
  NONE: "NO KILLZONE",
} as const;
export type Killzone = (typeof Killzone)[keyof typeof Killzone];

export interface SessionState {
  session: Session;
  killzone: Killzone;
}

/** Inclusive-start, exclusive-end window expressed as minutes-from-midnight. */
interface MinuteWindow<T> {
  startMin: number; // inclusive
  endMin: number; // exclusive; use 1440 for "midnight" (i.e. 24:00)
  value: T;
}

// Session boundaries in NY local time. Asia wraps midnight, modeled as two
// half-open intervals.
const SESSION_WINDOWS: readonly MinuteWindow<Session>[] = [
  { startMin: 20 * 60, endMin: 24 * 60, value: Session.ASIA }, // 20:00 → 24:00
  { startMin: 0, endMin: 4 * 60, value: Session.ASIA }, // 00:00 → 04:00
  { startMin: 3 * 60, endMin: 12 * 60, value: Session.LONDON }, // 03:00 → 12:00
  { startMin: 8 * 60, endMin: 17 * 60, value: Session.NEW_YORK }, // 08:00 → 17:00
];

// Killzone windows in NY local time — Pine getKillzone() schedule.
const KILLZONE_WINDOWS: readonly MinuteWindow<Killzone>[] = [
  { startMin: 20 * 60, endMin: 24 * 60, value: Killzone.ASIA_KZ }, // 20:00 - 24:00
  { startMin: 2 * 60, endMin: 5 * 60, value: Killzone.LONDON_KZ }, // 02:00 - 05:00
  { startMin: 9 * 60 + 30, endMin: 11 * 60, value: Killzone.NY_AM_KZ }, // 09:30 - 11:00
  { startMin: 12 * 60, endMin: 13 * 60, value: Killzone.NY_LUNCH }, // 12:00 - 13:00
  { startMin: 13 * 60 + 30, endMin: 16 * 60, value: Killzone.NY_PM_KZ }, // 13:30 - 16:00
];

/** Cached formatter — Intl.DateTimeFormat construction is non-trivial. */
const NY_PARTS_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour12: false,
  hour: "2-digit",
  minute: "2-digit",
});

/** Returns NY local minute-of-day (0..1439) for the given UTC epoch ms. */
function nyMinuteOfDay(tsUtcMs: number): number {
  const parts = NY_PARTS_FORMATTER.formatToParts(new Date(tsUtcMs));
  let hour = 0;
  let minute = 0;
  for (const p of parts) {
    if (p.type === "hour") {
      // en-US with hour12:false uses "24" for midnight; normalize to 0.
      hour = Number(p.value) % 24;
    } else if (p.type === "minute") {
      minute = Number(p.value);
    }
  }
  return hour * 60 + minute;
}

/**
 * Classify a UTC epoch-ms timestamp into ICT session + killzone.
 *
 * Killzone is NONE when the time is in a session but not within a
 * high-probability killzone window. Session priority for overlap zones:
 * the latest-listed match wins (NY trumps London trumps Asia) — matches
 * how traders refer to the "active session" in overlap windows.
 */
export function classifySession(tsUtcMs: number): SessionState {
  const minute = nyMinuteOfDay(tsUtcMs);

  let session: Session = Session.OFF_HOURS;
  for (const w of SESSION_WINDOWS) {
    if (minute >= w.startMin && minute < w.endMin) {
      session = w.value; // later match wins
    }
  }

  let killzone: Killzone = Killzone.NONE;
  for (const w of KILLZONE_WINDOWS) {
    if (minute >= w.startMin && minute < w.endMin) {
      killzone = w.value;
      break; // first match wins
    }
  }

  return { session, killzone };
}

/** True if the timestamp is in any killzone window. */
export function isKillzone(tsUtcMs: number): boolean {
  return classifySession(tsUtcMs).killzone !== Killzone.NONE;
}
