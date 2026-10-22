import { describe, expect, it } from "vitest";
import { redactPii, redactString } from "./redaction";

describe("redactString", () => {
  it("redacts emails", () => {
    expect(redactString("contact dilnoza@example.uz now")).toBe("contact [redacted-email] now");
  });

  it("redacts phone numbers", () => {
    expect(redactString("caller +998 90 111 22 33 waiting")).toBe("caller [redacted-phone] waiting");
  });

  it("redacts opaque tokens (API keys, JWTs)", () => {
    expect(redactString("key ovz_live_abc123.def456 used")).toBe("key [redacted-token] used");
  });

  it("does not mangle UUIDs (letters interleave the digits)", () => {
    const uuid = "9eaa3470-1a2b-4c3d-8e9f-abc123456789";
    expect(redactString(`id ${uuid}`)).toBe(`id ${uuid}`);
  });
});

describe("redactPii", () => {
  it("replaces sensitive keys wholesale regardless of value", () => {
    const out = redactPii({ password: "hunter2", tokenHash: "x", nested: { secret: "y" } });
    expect(out).toEqual({ password: "[redacted]", tokenHash: "[redacted]", nested: { secret: "[redacted]" } });
  });

  it("scrubs PII inside string values of non-sensitive keys", () => {
    const out = redactPii({ note: "ring bob@acme.io or +998901112233" }) as { note: string };
    expect(out.note).toBe("ring [redacted-email] or [redacted-phone]");
  });

  it("walks arrays and is cycle-safe", () => {
    const cyclic: Record<string, unknown> = { items: ["a@b.co"] };
    cyclic.self = cyclic;
    const out = redactPii(cyclic) as { items: string[]; self: unknown };
    expect(out.items[0]).toBe("[redacted-email]");
    expect(out.self).toBe("[circular]");
  });
});
