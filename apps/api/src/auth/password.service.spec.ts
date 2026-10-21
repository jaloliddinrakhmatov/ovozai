import { describe, expect, it } from "vitest";
import { PasswordService } from "./password.service";

describe("PasswordService", () => {
  const service = new PasswordService();

  it("hashes with argon2id and verifies the correct password", async () => {
    const hash = await service.hash("correct horse battery staple");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await service.verify(hash, "correct horse battery staple")).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await service.hash("s3cret-password");
    expect(await service.verify(hash, "wrong-password")).toBe(false);
  });

  it("returns false (never throws) for a malformed hash", async () => {
    expect(await service.verify("not-a-hash", "whatever")).toBe(false);
  });
});
