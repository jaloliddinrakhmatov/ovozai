import type { AuthTokens } from "@ovozai/contracts";

/**
 * SSR-safe access/refresh token store.
 *
 * Tokens live in a module-level variable (the source of truth for the running
 * tab) and are mirrored to `localStorage` so a page reload re-hydrates the
 * session. Every `localStorage` access is guarded for server rendering and
 * wrapped in try/catch (private mode, blocked storage, quota).
 */

const STORAGE_KEY = "ovozai.auth.tokens";

/** The subset of {@link AuthTokens} we persist. */
export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

let memoryTokens: StoredTokens | null = null;
let hydrated = false;

/** Resolve `localStorage`, or `null` when unavailable (SSR, private mode). */
function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readFromStorage(): StoredTokens | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "accessToken" in parsed &&
      "refreshToken" in parsed &&
      typeof (parsed as Record<string, unknown>).accessToken === "string" &&
      typeof (parsed as Record<string, unknown>).refreshToken === "string"
    ) {
      const value = parsed as Record<"accessToken" | "refreshToken", string>;
      return { accessToken: value.accessToken, refreshToken: value.refreshToken };
    }
    return null;
  } catch {
    return null;
  }
}

function writeToStorage(tokens: StoredTokens): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  } catch {
    // Ignore write failures (quota, private mode): memory remains authoritative.
  }
}

function removeFromStorage(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}

/** Current tokens, hydrating once from `localStorage` on first read. */
export function getTokens(): StoredTokens | null {
  if (!hydrated && memoryTokens === null) {
    memoryTokens = readFromStorage();
    hydrated = true;
  }
  return memoryTokens;
}

/** Replace the stored tokens (accepts the full {@link AuthTokens} pair). */
export function setTokens(tokens: StoredTokens | AuthTokens): void {
  const normalized: StoredTokens = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
  memoryTokens = normalized;
  hydrated = true;
  writeToStorage(normalized);
}

/** Clear tokens from both memory and `localStorage`. */
export function clearTokens(): void {
  memoryTokens = null;
  hydrated = true;
  removeFromStorage();
}

/** The current access token, or `null` when signed out. */
export function getAccessToken(): string | null {
  return getTokens()?.accessToken ?? null;
}

/** The current refresh token, or `null` when signed out. */
export function getRefreshToken(): string | null {
  return getTokens()?.refreshToken ?? null;
}

/** True when a token pair is present. */
export function hasTokens(): boolean {
  return getTokens() !== null;
}
