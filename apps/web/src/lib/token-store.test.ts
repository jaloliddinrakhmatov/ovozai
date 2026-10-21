import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  getTokens,
  hasTokens,
  setTokens,
} from "./token-store";

afterEach(() => {
  clearTokens();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("token store (in-memory, SSR path)", () => {
  it("starts empty and stores a token pair", () => {
    expect(getTokens()).toBeNull();
    expect(hasTokens()).toBe(false);

    setTokens({ accessToken: "a", refreshToken: "r" });

    expect(getAccessToken()).toBe("a");
    expect(getRefreshToken()).toBe("r");
    expect(hasTokens()).toBe(true);
  });

  it("normalizes a full AuthTokens pair down to the stored subset", () => {
    setTokens({ tokenType: "Bearer", accessToken: "a2", refreshToken: "r2", expiresIn: 900 });
    expect(getTokens()).toEqual({ accessToken: "a2", refreshToken: "r2" });
  });

  it("clears tokens", () => {
    setTokens({ accessToken: "a", refreshToken: "r" });
    clearTokens();
    expect(getTokens()).toBeNull();
    expect(hasTokens()).toBe(false);
  });
});

function makeLocalStorage() {
  const map = new Map<string, string>();
  const ls = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
  return { map, ls };
}

describe("token store (localStorage mirror)", () => {
  it("mirrors writes and re-hydrates a fresh module from storage", async () => {
    const { map, ls } = makeLocalStorage();
    vi.stubGlobal("window", { localStorage: ls });

    vi.resetModules();
    const first = await import("./token-store");
    first.setTokens({ accessToken: "persisted", refreshToken: "refresh" });
    expect(map.get("ovozai.auth.tokens")).toContain("persisted");

    // Simulate a page reload: a brand-new module instance, same storage.
    vi.resetModules();
    const second = await import("./token-store");
    expect(second.getAccessToken()).toBe("persisted");
    expect(second.getRefreshToken()).toBe("refresh");
  });

  it("removes the mirrored value on clear", async () => {
    const { map, ls } = makeLocalStorage();
    vi.stubGlobal("window", { localStorage: ls });

    vi.resetModules();
    const mod = await import("./token-store");
    mod.setTokens({ accessToken: "a", refreshToken: "r" });
    mod.clearTokens();
    expect(map.has("ovozai.auth.tokens")).toBe(false);
  });

  it("falls back to memory when localStorage throws", async () => {
    const throwingLs = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    vi.stubGlobal("window", { localStorage: throwingLs });

    vi.resetModules();
    const mod = await import("./token-store");
    mod.setTokens({ accessToken: "mem", refreshToken: "r" });
    // Write failed silently; memory remains authoritative for this instance.
    expect(mod.getAccessToken()).toBe("mem");
  });
});
