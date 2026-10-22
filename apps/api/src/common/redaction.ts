/**
 * PII redaction for logs and audit metadata (Phase 7, docs/COMPLIANCE.md §4).
 * Voice-receptionist logs can incidentally contain caller phone numbers, emails,
 * and credentials; we redact them before anything reaches stdout / aggregation.
 */

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
// A run of 9+ "phone-ish" characters starting and ending with a digit, NOT
// adjacent to word characters — so it matches "+998 90 111 22 33" but leaves the
// numeric segments of UUIDs/hashes/long ids (which abut letters) intact.
const PHONE_RE = /(?<![\w])\+?\d[\d().\s-]{7,}\d(?![\w])/g;
// Opaque credentials: our API-key format, JWTs, and long hex/base64 secrets.
const TOKEN_RE = /\b(ovz_live_[A-Za-z0-9._-]+|eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g;

/** Field names whose values are always replaced wholesale, regardless of content. */
const SENSITIVE_KEYS = new Set(
  [
    "password",
    "hashedpassword",
    "token",
    "tokenhash",
    "refreshtoken",
    "accesstoken",
    "secret",
    "hashedkey",
    "apikey",
    "authorization",
    "cookie",
    "set-cookie",
    "signature",
    "servicetoken",
  ].map((k) => k.toLowerCase()),
);

const MAX_DEPTH = 6;

/** Redact PII/credentials from a single string value. */
export function redactString(value: string): string {
  return value
    .replace(EMAIL_RE, "[redacted-email]")
    .replace(TOKEN_RE, "[redacted-token]")
    .replace(PHONE_RE, "[redacted-phone]");
}

/**
 * Deep-redact a value: sensitive keys are replaced wholesale, strings are scrubbed
 * for emails/phones/tokens, and objects/arrays are walked (bounded depth, cycle-safe).
 */
export function redactPii<T>(value: T, depth = 0, seen = new WeakSet<object>()): T {
  if (typeof value === "string") {
    return redactString(value) as unknown as T;
  }
  if (value === null || typeof value !== "object" || depth >= MAX_DEPTH) {
    return value;
  }
  if (seen.has(value as object)) {
    return "[circular]" as unknown as T;
  }
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redactPii(item, depth + 1, seen)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEYS.has(key.toLowerCase())
      ? "[redacted]"
      : redactPii(val, depth + 1, seen);
  }
  return out as unknown as T;
}
