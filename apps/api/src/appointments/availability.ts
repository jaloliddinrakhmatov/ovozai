import type { Language } from "@ovozai/contracts";

/**
 * Booking availability: a pure, deterministic policy layer so the voice agent
 * (and the dashboard) never double-book, book in the past, or book outside a
 * business's hours — and can offer the caller the nearest open alternatives.
 *
 * Everything here is side-effect free and unit-tested in `availability.spec.ts`.
 * The agent's booking policy lives in `agent.config.booking` (see CLAUDE.md /
 * docs/VOICE_PIPELINE.md); it is parsed defensively with sensible UZ defaults.
 */

/** 0 = Sunday … 6 = Saturday (matches `Date#getUTCDay`). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** One open window within a day, in minutes from local midnight. */
export interface TimeWindow {
  openMin: number;
  closeMin: number;
}

/** Open windows per weekday. A weekday absent from the map is treated as closed. */
export type WeeklyHours = Partial<Record<Weekday, TimeWindow[]>>;

export interface BookingPolicy {
  /** IANA timezone the business's hours are expressed in. */
  timezone: string;
  /** Default appointment length when none is given, and the suggestion grid step. */
  slotMinutes: number;
  /** How many appointments may overlap one slot (chairs/rooms/staff). */
  capacity: number;
  /** Minimum notice (minutes) before the earliest bookable slot. */
  leadMinutes: number;
  /** Business hours. `undefined` means always open (no hours constraint). */
  hours?: WeeklyHours;
}

export const DEFAULT_BOOKING_POLICY: BookingPolicy = {
  timezone: "Asia/Tashkent",
  slotMinutes: 30,
  capacity: 1,
  leadMinutes: 0,
};

export interface ExistingAppointment {
  id?: string;
  startsAt: Date;
  endsAt: Date | null;
}

export type UnavailableReason = "past" | "out_of_hours" | "conflict";

export interface AvailabilityResult {
  available: boolean;
  reason?: UnavailableReason;
  /** Up to 3 alternative start times, soonest first (only when unavailable). */
  suggestions: Date[];
}

const DAY_KEYS: Record<string, Weekday> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  weds: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

const WEEKDAY_FROM_SHORT: Record<string, Weekday> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function parseHHMM(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 24 || m > 59 || (h === 24 && m !== 0)) return null;
  return h * 60 + m;
}

function parseWindows(raw: unknown): TimeWindow[] {
  if (!Array.isArray(raw)) return [];
  const windows: TimeWindow[] = [];
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const openMin = parseHHMM(entry[0]);
    const closeMin = parseHHMM(entry[1]);
    if (openMin == null || closeMin == null || closeMin <= openMin) continue;
    windows.push({ openMin, closeMin });
  }
  return windows;
}

/** Read `agent.config.booking` into a {@link BookingPolicy}, ignoring malformed parts. */
export function parseBookingPolicy(config: unknown): BookingPolicy {
  const policy: BookingPolicy = { ...DEFAULT_BOOKING_POLICY };
  if (typeof config !== "object" || config === null) return policy;
  const booking = (config as Record<string, unknown>).booking;
  if (typeof booking !== "object" || booking === null) return policy;
  const b = booking as Record<string, unknown>;

  if (typeof b.timezone === "string" && isValidTimezone(b.timezone)) {
    policy.timezone = b.timezone;
  }
  if (typeof b.slotMinutes === "number" && b.slotMinutes >= 5 && b.slotMinutes <= 480) {
    policy.slotMinutes = Math.floor(b.slotMinutes);
  }
  if (typeof b.capacity === "number" && b.capacity >= 1 && b.capacity <= 1000) {
    policy.capacity = Math.floor(b.capacity);
  }
  if (typeof b.leadMinutes === "number" && b.leadMinutes >= 0 && b.leadMinutes <= 100_000) {
    policy.leadMinutes = Math.floor(b.leadMinutes);
  }
  if (typeof b.hours === "object" && b.hours !== null) {
    const hours: WeeklyHours = {};
    let any = false;
    for (const [key, value] of Object.entries(b.hours as Record<string, unknown>)) {
      const day = DAY_KEYS[key.toLowerCase()] ?? (/^[0-6]$/.test(key) ? (Number(key) as Weekday) : undefined);
      if (day === undefined) continue;
      hours[day] = parseWindows(value);
      any = true;
    }
    if (any) policy.hours = hours;
  }
  return policy;
}

/** The weekday + minutes-from-midnight of an instant, in the given timezone. */
export function wallClock(date: Date, timezone: string): { weekday: Weekday; minutes: number } {
  const tz = isValidTimezone(timezone) ? timezone : "UTC";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { weekday: WEEKDAY_FROM_SHORT[weekdayStr] ?? 0, minutes: hour * 60 + minute };
}

function withinHours(start: Date, durationMin: number, policy: BookingPolicy): boolean {
  if (!policy.hours) return true;
  const { weekday, minutes } = wallClock(start, policy.timezone);
  const endMinutes = minutes + durationMin;
  const windows = policy.hours[weekday] ?? [];
  return windows.some((w) => minutes >= w.openMin && endMinutes <= w.closeMin);
}

function overlapCount(
  start: Date,
  durationMin: number,
  existing: ExistingAppointment[],
  policy: BookingPolicy,
  excludeId?: string,
): number {
  const reqStart = start.getTime();
  const reqEnd = reqStart + durationMin * 60_000;
  let count = 0;
  for (const appt of existing) {
    if (excludeId && appt.id === excludeId) continue;
    const eStart = appt.startsAt.getTime();
    const eEnd = appt.endsAt ? appt.endsAt.getTime() : eStart + policy.slotMinutes * 60_000;
    if (eStart < reqEnd && reqStart < eEnd) count += 1;
  }
  return count;
}

function classify(
  start: Date,
  durationMin: number,
  existing: ExistingAppointment[],
  policy: BookingPolicy,
  now: Date,
  excludeId?: string,
): UnavailableReason | undefined {
  if (start.getTime() < now.getTime() + policy.leadMinutes * 60_000) return "past";
  if (!withinHours(start, durationMin, policy)) return "out_of_hours";
  if (overlapCount(start, durationMin, existing, policy, excludeId) >= policy.capacity) return "conflict";
  return undefined;
}

/** The instant on `dayAnchor`'s calendar day (in `timezone`) at `minutesOfDay`. */
function instantOnDay(dayAnchor: Date, minutesOfDay: number, timezone: string): Date {
  const tz = isValidTimezone(timezone) ? timezone : "UTC";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(dayAnchor);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return zonedWallClockToUtc(
    get("year"),
    get("month"),
    get("day"),
    Math.floor(minutesOfDay / 60),
    minutesOfDay % 60,
    0,
    tz,
  );
}

/**
 * Up to 3 alternative start times, blended so they feel like a receptionist's:
 * the nearest open slot (great for a clash — "I have 15:30 instead"), plus the
 * SAME time of day on the next open days ("or 15:00 tomorrow") rather than only
 * the earliest morning slot.
 */
function findSuggestions(
  base: Date,
  durationMin: number,
  existing: ExistingAppointment[],
  policy: BookingPolicy,
  now: Date,
  excludeId?: string,
): Date[] {
  const slotMs = policy.slotMinutes * 60_000;
  const earliest = Math.max(base.getTime(), now.getTime() + policy.leadMinutes * 60_000);
  const picks: Date[] = [];
  const seen = new Set<number>();
  const add = (candidate: Date): void => {
    if (
      candidate.getTime() >= earliest &&
      !seen.has(candidate.getTime()) &&
      !classify(candidate, durationMin, existing, policy, now, excludeId)
    ) {
      seen.add(candidate.getTime());
      picks.push(candidate);
    }
  };

  // 1) The nearest open slot from the requested time (handles a clash on the day).
  let t = Math.ceil(earliest / slotMs) * slotMs;
  for (let i = 0; i < 96 && picks.length < 1; i += 1, t += slotMs) add(new Date(t));

  // 2) The same time of day on the upcoming days.
  const requestedMinutes = wallClock(base, policy.timezone).minutes;
  for (let dayOffset = 0; dayOffset <= 14 && picks.length < 3; dayOffset += 1) {
    add(instantOnDay(new Date(base.getTime() + dayOffset * 86_400_000), requestedMinutes, policy.timezone));
  }

  // 3) Fill any remaining slots with the earliest-forward scan (bounded).
  t = Math.ceil(earliest / slotMs) * slotMs;
  for (let i = 0; i < 672 && picks.length < 3; i += 1, t += slotMs) add(new Date(t));

  return picks.sort((a, b) => a.getTime() - b.getTime()).slice(0, 3);
}

/**
 * Is `start` (for `durationMin`) bookable under `policy`, given `existing`
 * appointments? When not, `suggestions` holds the nearest open alternatives.
 * `excludeId` drops one appointment from the conflict set (used by reschedule).
 */
export function checkSlotAvailability(
  start: Date,
  durationMin: number,
  existing: ExistingAppointment[],
  policy: BookingPolicy,
  now: Date,
  excludeId?: string,
): AvailabilityResult {
  const reason = classify(start, durationMin, existing, policy, now, excludeId);
  if (!reason) return { available: true, suggestions: [] };
  return {
    available: false,
    reason,
    suggestions: findSuggestions(start, durationMin, existing, policy, now, excludeId),
  };
}

/** A short, human-friendly rendering of an instant in the policy timezone + caller language. */
export function formatWhen(date: Date, timezone: string, language: Language = "EN"): string {
  const locale = language === "RU" ? "ru-RU" : language === "UZ" ? "uz-UZ" : "en-GB";
  const tz = isValidTimezone(timezone) ? timezone : "UTC";
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: tz,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

/** The timezone's offset from UTC (ms) at a given instant. */
function tzOffsetMs(date: Date, timezone: string): number {
  const tz = isValidTimezone(timezone) ? timezone : "UTC";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - date.getTime();
}

/** The UTC instant whose wall-clock, in `timezone`, is the given local time. */
function zonedWallClockToUtc(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  timezone: string,
): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  // One correction step is exact for fixed-offset zones (e.g. Asia/Tashkent)
  // and accurate elsewhere except at the DST boundary itself.
  return new Date(guess - tzOffsetMs(new Date(guess), timezone));
}

/**
 * Parse an LLM-supplied date-time string to an instant. A value with an explicit
 * `Z`/offset is taken as-is; a timezone-less wall-clock value is interpreted in
 * `timezone` (not the server's local zone). Returns an Invalid Date only when
 * the string is unparseable.
 */
export function toInstant(raw: string, timezone: string): Date {
  const s = raw.trim().replace(" ", "T");
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) {
    return zonedWallClockToUtc(
      Number(m[1]),
      Number(m[2]),
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      m[6] ? Number(m[6]) : 0,
      timezone,
    );
  }
  return new Date(s);
}

/** Minutes between two instants (>= 0), or `fallback` when `end` is missing/invalid. */
export function durationMinutesBetween(start: Date, end: Date | null | undefined, fallback: number): number {
  if (!end) return fallback;
  const diff = Math.round((end.getTime() - start.getTime()) / 60_000);
  return diff > 0 ? diff : fallback;
}
