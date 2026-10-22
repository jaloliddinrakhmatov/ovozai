import { describe, expect, it } from "vitest";
import {
  checkSlotAvailability,
  DEFAULT_BOOKING_POLICY,
  durationMinutesBetween,
  formatWhen,
  parseBookingPolicy,
  type BookingPolicy,
  type ExistingAppointment,
} from "./availability";

// Asia/Tashkent is UTC+5 with no DST, so a UTC instant + 5h is the local wall clock.
const NOW = new Date("2026-10-22T06:00:00Z"); // 11:00 local
const everyDay = { "0": [["09:00", "18:00"]], "1": [["09:00", "18:00"]], "2": [["09:00", "18:00"]], "3": [["09:00", "18:00"]], "4": [["09:00", "18:00"]], "5": [["09:00", "18:00"]], "6": [["09:00", "18:00"]] };

function policy(overrides: Partial<BookingPolicy> = {}): BookingPolicy {
  return {
    ...DEFAULT_BOOKING_POLICY,
    hours: parseBookingPolicy({ booking: { hours: everyDay } }).hours,
    ...overrides,
  };
}

describe("parseBookingPolicy", () => {
  it("returns UZ defaults for empty/invalid input", () => {
    expect(parseBookingPolicy(null)).toEqual(DEFAULT_BOOKING_POLICY);
    expect(parseBookingPolicy({})).toEqual(DEFAULT_BOOKING_POLICY);
    expect(parseBookingPolicy({ booking: "nope" })).toEqual(DEFAULT_BOOKING_POLICY);
    expect(parseBookingPolicy(undefined).timezone).toBe("Asia/Tashkent");
  });

  it("parses timezone, slot, capacity, lead, and weekday hours", () => {
    const p = parseBookingPolicy({
      booking: {
        timezone: "Europe/Moscow",
        slotMinutes: 45,
        capacity: 3,
        leadMinutes: 60,
        hours: { mon: [["09:00", "13:00"], ["14:00", "18:00"]], sun: [] },
      },
    });
    expect(p.timezone).toBe("Europe/Moscow");
    expect(p.slotMinutes).toBe(45);
    expect(p.capacity).toBe(3);
    expect(p.leadMinutes).toBe(60);
    expect(p.hours?.[1]).toEqual([
      { openMin: 540, closeMin: 780 },
      { openMin: 840, closeMin: 1080 },
    ]);
    expect(p.hours?.[0]).toEqual([]); // Sunday explicitly closed
  });

  it("ignores malformed values and an invalid timezone", () => {
    const p = parseBookingPolicy({
      booking: { timezone: "Not/AZone", slotMinutes: 9999, capacity: 0, hours: { mon: [["bad", "18:00"]] } },
    });
    expect(p.timezone).toBe("Asia/Tashkent"); // invalid tz rejected
    expect(p.slotMinutes).toBe(30); // out-of-range rejected
    expect(p.capacity).toBe(1);
    expect(p.hours?.[1]).toEqual([]); // malformed window dropped
  });
});

describe("checkSlotAvailability", () => {
  it("accepts a free, in-hours slot", () => {
    const r = checkSlotAvailability(new Date("2026-10-22T09:00:00Z"), 30, [], policy(), NOW);
    expect(r.available).toBe(true);
    expect(r.suggestions).toEqual([]);
  });

  it("rejects a slot in the past", () => {
    const r = checkSlotAvailability(new Date("2026-10-22T05:00:00Z"), 30, [], policy(), NOW);
    expect(r.available).toBe(false);
    expect(r.reason).toBe("past");
  });

  it("honors a lead time", () => {
    const r = checkSlotAvailability(
      new Date("2026-10-22T06:30:00Z"),
      30,
      [],
      policy({ leadMinutes: 120 }),
      NOW,
    );
    expect(r.reason).toBe("past"); // only 30 min ahead, needs 120
  });

  it("rejects an out-of-hours slot and suggests the next open morning", () => {
    const r = checkSlotAvailability(new Date("2026-10-22T14:00:00Z"), 30, [], policy(), NOW); // 19:00 local
    expect(r.available).toBe(false);
    expect(r.reason).toBe("out_of_hours");
    expect(r.suggestions[0]?.toISOString()).toBe("2026-10-23T04:00:00.000Z"); // 09:00 local next day
  });

  it("detects a conflict at capacity 1 and suggests the next free slot", () => {
    const existing: ExistingAppointment[] = [{ id: "x", startsAt: new Date("2026-10-22T09:00:00Z"), endsAt: null }];
    const r = checkSlotAvailability(new Date("2026-10-22T09:00:00Z"), 30, existing, policy(), NOW);
    expect(r.available).toBe(false);
    expect(r.reason).toBe("conflict");
    expect(r.suggestions[0]?.toISOString()).toBe("2026-10-22T09:30:00.000Z");
  });

  it("allows overlap up to capacity", () => {
    const existing: ExistingAppointment[] = [{ id: "x", startsAt: new Date("2026-10-22T09:00:00Z"), endsAt: null }];
    const r = checkSlotAvailability(new Date("2026-10-22T09:00:00Z"), 30, existing, policy({ capacity: 2 }), NOW);
    expect(r.available).toBe(true);
  });

  it("excludes the appointment being rescheduled from the conflict set", () => {
    const existing: ExistingAppointment[] = [{ id: "move-me", startsAt: new Date("2026-10-22T09:00:00Z"), endsAt: null }];
    const r = checkSlotAvailability(new Date("2026-10-22T09:00:00Z"), 30, existing, policy(), NOW, "move-me");
    expect(r.available).toBe(true);
  });

  it("treats a 24/7 policy (no hours) as always open", () => {
    const r = checkSlotAvailability(new Date("2026-10-23T22:00:00Z"), 30, [], DEFAULT_BOOKING_POLICY, NOW);
    expect(r.available).toBe(true);
  });
});

describe("helpers", () => {
  it("durationMinutesBetween computes or falls back", () => {
    expect(durationMinutesBetween(new Date("2026-10-22T09:00:00Z"), new Date("2026-10-22T10:00:00Z"), 30)).toBe(60);
    expect(durationMinutesBetween(new Date("2026-10-22T09:00:00Z"), null, 30)).toBe(30);
    expect(durationMinutesBetween(new Date("2026-10-22T09:00:00Z"), new Date("2026-10-22T08:00:00Z"), 30)).toBe(30);
  });

  it("formatWhen renders a non-empty local string", () => {
    const s = formatWhen(new Date("2026-10-22T09:00:00Z"), "Asia/Tashkent", "EN");
    expect(s.length).toBeGreaterThan(0);
    expect(s).toContain("14"); // 09:00Z = 14:00 local
  });
});
