/**
 * Date/time helpers shared by the dashboard screens. All are pure and
 * SSR-safe (they rely only on the standard `Date` API).
 */

/** Format an ISO timestamp for display, or `—` when absent/invalid. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/** Format an ISO timestamp as a date only, or `—` when absent/invalid. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

/**
 * Convert an ISO timestamp into the `YYYY-MM-DDTHH:mm` value a
 * `<input type="datetime-local">` expects, expressed in local time.
 */
export function isoToLocalInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number): string => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * Convert a `datetime-local` input value (local time) into a UTC ISO string,
 * or `null` when the value is empty/unparseable.
 */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
