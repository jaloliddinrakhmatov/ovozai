import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import type { JwtService } from "@nestjs/jwt";
import type { PrismaService } from "../prisma/prisma.service";
import type { RedisService } from "../redis/redis.service";
import { TokenService } from "./token.service";
import { buildRefreshToken, parseRefreshToken, sha256Hex } from "./crypto.util";

function future(): Date {
  return new Date(Date.now() + 60_000);
}

describe("TokenService", () => {
  const sessionCreate = vi.fn();
  const sessionFindUnique = vi.fn();
  const sessionUpdate = vi.fn();
  const sessionUpdateMany = vi.fn();
  const membershipFindUnique = vi.fn();
  const denySession = vi.fn();

  const prisma = {
    base: {
      session: {
        create: sessionCreate,
        findUnique: sessionFindUnique,
        update: sessionUpdate,
        updateMany: sessionUpdateMany,
      },
      membership: { findUnique: membershipFindUnique },
    },
  } as unknown as PrismaService;

  const jwt = { signAsync: vi.fn().mockResolvedValue("access.jwt.token") } as unknown as JwtService;
  const config = { get: vi.fn().mockReturnValue(undefined) } as unknown as ConfigService;
  const redis = { denySession } as unknown as RedisService;

  const service = new TokenService(jwt, config, prisma, redis);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createSession persists a session and returns a session-bound refresh token", async () => {
    sessionCreate.mockResolvedValue({});
    const issued = await service.createSession({ userId: "u1", organizationId: "org1", role: "OWNER" });

    expect(sessionCreate).toHaveBeenCalledTimes(1);
    const data = sessionCreate.mock.calls[0]![0].data as { id: string; tokenHash: string };
    expect(parseRefreshToken(issued.refreshToken)?.sessionId).toBe(data.id);
    expect(issued.accessToken).toBe("access.jwt.token");
    expect(issued.organizationId).toBe("org1");
  });

  it("rotateSession rejects a malformed token", async () => {
    await expect(service.rotateSession("garbage")).rejects.toMatchObject({ code: "invalid_token" });
  });

  it("rotateSession rejects an unknown session", async () => {
    sessionFindUnique.mockResolvedValue(null);
    const { token } = buildRefreshToken("missing");
    await expect(service.rotateSession(token)).rejects.toMatchObject({ code: "invalid_token" });
  });

  it("rotateSession rotates a valid token and re-resolves the live role", async () => {
    const { token, tokenHash } = buildRefreshToken("sess-1");
    sessionFindUnique.mockResolvedValue({
      id: "sess-1",
      userId: "u1",
      organizationId: "org1",
      tokenHash,
      status: "ACTIVE",
      expiresAt: future(),
    });
    membershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    sessionUpdate.mockResolvedValue({});

    const issued = await service.rotateSession(token);
    expect(sessionUpdate).toHaveBeenCalledTimes(1);
    expect(issued.role).toBe("ADMIN");
    expect(issued.refreshToken).not.toBe(token);
    expect(sha256Hex(parseRefreshToken(issued.refreshToken)!.secret)).not.toBe(tokenHash);
  });

  it("rotateSession detects reuse of a rotated token and revokes the session", async () => {
    const { token } = buildRefreshToken("sess-2");
    sessionFindUnique.mockResolvedValue({
      id: "sess-2",
      userId: "u1",
      organizationId: "org1",
      tokenHash: sha256Hex("a-different-secret"),
      status: "ACTIVE",
      expiresAt: future(),
    });
    sessionUpdateMany.mockResolvedValue({ count: 1 });

    await expect(service.rotateSession(token)).rejects.toMatchObject({ code: "invalid_token" });
    expect(sessionUpdateMany).toHaveBeenCalledTimes(1);
    expect(sessionUpdateMany.mock.calls[0]![0].data.status).toBe("REVOKED");
    expect(denySession).toHaveBeenCalledWith("sess-2", expect.any(Number));
  });

  it("rotateSession demotes to orgless when the membership is gone", async () => {
    const { token, tokenHash } = buildRefreshToken("sess-3");
    sessionFindUnique.mockResolvedValue({
      id: "sess-3",
      userId: "u1",
      organizationId: "org1",
      tokenHash,
      status: "ACTIVE",
      expiresAt: future(),
    });
    membershipFindUnique.mockResolvedValue(null);
    sessionUpdate.mockResolvedValue({});

    const issued = await service.rotateSession(token);
    expect(issued.organizationId).toBeNull();
    expect(issued.role).toBeNull();
  });
});
