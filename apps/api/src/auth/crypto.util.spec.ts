import { describe, expect, it } from "vitest";
import {
  buildRefreshToken,
  constantTimeEqualHex,
  generateApiKey,
  parseApiKey,
  parseRefreshToken,
  sha256Hex,
} from "./crypto.util";

describe("crypto.util", () => {
  it("sha256Hex is deterministic and 64 hex chars", () => {
    const a = sha256Hex("hello");
    expect(a).toBe(sha256Hex("hello"));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(sha256Hex("world"));
  });

  it("constantTimeEqualHex compares equal-length hex digests", () => {
    const digest = sha256Hex("secret");
    expect(constantTimeEqualHex(digest, digest)).toBe(true);
    expect(constantTimeEqualHex(digest, sha256Hex("other"))).toBe(false);
    expect(constantTimeEqualHex(digest, "abc")).toBe(false);
    expect(constantTimeEqualHex("", "")).toBe(false);
  });

  it("generates an API key whose secret hashes to the stored hash", () => {
    const generated = generateApiKey();
    expect(generated.prefix.startsWith("ovz_live_")).toBe(true);
    const parsed = parseApiKey(generated.key);
    expect(parsed).not.toBeNull();
    expect(parsed?.prefix).toBe(generated.prefix);
    expect(sha256Hex(parsed!.secret)).toBe(generated.hashedKey);
  });

  it("parseApiKey rejects malformed keys", () => {
    expect(parseApiKey("nodot")).toBeNull();
    expect(parseApiKey("wrong_prefix_abc.secret")).toBeNull();
    expect(parseApiKey("ovz_live_abc.")).toBeNull();
  });

  it("builds a refresh token bound to a session id, verifiable by hash", () => {
    const { token, tokenHash } = buildRefreshToken("sess-123");
    const parsed = parseRefreshToken(token);
    expect(parsed?.sessionId).toBe("sess-123");
    expect(sha256Hex(parsed!.secret)).toBe(tokenHash);
  });

  it("parseRefreshToken rejects malformed tokens", () => {
    expect(parseRefreshToken("nodot")).toBeNull();
    expect(parseRefreshToken("sess.")).toBeNull();
    expect(parseRefreshToken(".secret")).toBeNull();
  });
});
