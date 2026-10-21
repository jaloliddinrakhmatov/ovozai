import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { API_KEY_PREFIX } from "@ovozai/contracts";

/** SHA-256 hex digest. Used for hashing high-entropy secrets (refresh tokens, */
/** invite tokens, API-key secrets) at rest — not for passwords (see PasswordService). */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** A URL-safe random secret with `bytes` bytes of entropy. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Constant-time comparison of two equal-length hex digests. */
export function constantTimeEqualHex(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "hex");
  const bufferB = Buffer.from(b, "hex");
  if (bufferA.length === 0 || bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

export interface GeneratedApiKey {
  /** Public, stored identifier, e.g. `ovz_live_<16 hex>`. */
  prefix: string;
  /** Full secret returned to the caller once: `<prefix>.<secret>`. */
  key: string;
  /** SHA-256 of the secret portion, stored at rest. */
  hashedKey: string;
}

/** Generate a fresh API key (`ovz_live_<prefix>.<secret>`). */
export function generateApiKey(): GeneratedApiKey {
  const id = randomBytes(8).toString("hex");
  const prefix = `${API_KEY_PREFIX}${id}`;
  const secret = randomToken(24);
  return {
    prefix,
    key: `${prefix}.${secret}`,
    hashedKey: sha256Hex(secret),
  };
}

/** Split a raw API key into its prefix and secret, or null if malformed. */
export function parseApiKey(raw: string): { prefix: string; secret: string } | null {
  const separator = raw.lastIndexOf(".");
  if (separator <= 0) return null;
  const prefix = raw.slice(0, separator);
  const secret = raw.slice(separator + 1);
  if (!prefix.startsWith(API_KEY_PREFIX) || secret.length === 0) return null;
  return { prefix, secret };
}

export interface GeneratedRefreshToken {
  /** The raw refresh token delivered to the client: `<sessionId>.<secret>`. */
  token: string;
  /** SHA-256 of the secret portion, stored on the session. */
  tokenHash: string;
}

/** Build a refresh token bound to a session id. */
export function buildRefreshToken(sessionId: string): GeneratedRefreshToken {
  const secret = randomToken(32);
  return {
    token: `${sessionId}.${secret}`,
    tokenHash: sha256Hex(secret),
  };
}

/** Parse a refresh token into its session id and secret, or null if malformed. */
export function parseRefreshToken(raw: string): { sessionId: string; secret: string } | null {
  const separator = raw.indexOf(".");
  if (separator <= 0) return null;
  const sessionId = raw.slice(0, separator);
  const secret = raw.slice(separator + 1);
  if (secret.length === 0) return null;
  return { sessionId, secret };
}
