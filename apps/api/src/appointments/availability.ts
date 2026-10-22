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
  let t = Math.ceil(earliest / slotMs) * slotMs;
  const out: Date[] = [];
  // Bound the scan (~14 days at 30-min slots) so it always terminates.
  for (let i = 0; i < 672 && out.length < 3; i += 1, t += slotMs) {
    const candidate = new Date(t);
    if (!classify(candidate, durationMin, existing, policy, now, excludeId)) {
      out.push(candidate);
    }
  }
  return out;
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

/** Minutes between two instants (>= 0), or `fallback` when `end` is missing/invalid. */
export function durationMinutesBetween(start: Date, end: Date | null | undefined, fallback: number): number {
  if (!end) return fallback;
  const diff = Math.round((end.getTime() - start.getTime()) / 60_000);
  return diff > 0 ? diff : fallback;
}
