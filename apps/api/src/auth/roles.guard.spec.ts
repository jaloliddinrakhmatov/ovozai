import { describe, expect, it, vi } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import type { MembershipRole } from "@ovozai/contracts";
import { RolesGuard } from "./roles.guard";
import { ProblemException } from "../common/problem.exception";
import type { UserPrincipal } from "../common/principal.types";

function contextFor(principal: UserPrincipal | undefined): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ principal }) }),
  } as unknown as ExecutionContext;
}

function reflectorReturning(minRole: MembershipRole | undefined): Reflector {
  return { getAllAndOverride: vi.fn().mockReturnValue(minRole) } as unknown as Reflector;
}

function principal(role: MembershipRole | null, organizationId: string | null = "org1"): UserPrincipal {
  return { type: "user", userId: "u1", sessionId: "s1", organizationId, role };
}

function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("RolesGuard", () => {
  it("allows routes without a role requirement", () => {
    const guard = new RolesGuard(reflectorReturning(undefined));
    expect(guard.canActivate(contextFor(principal("VIEWER")))).toBe(true);
  });

  it("allows a higher role to satisfy a lower minimum", () => {
    const guard = new RolesGuard(reflectorReturning("ADMIN"));
    expect(guard.canActivate(contextFor(principal("OWNER")))).toBe(true);
  });

  it("rejects a role below the minimum with forbidden", () => {
    const guard = new RolesGuard(reflectorReturning("ADMIN"));
    const error = thrownBy(() => guard.canActivate(contextFor(principal("VIEWER"))));
    expect(error).toBeInstanceOf(ProblemException);
    expect((error as ProblemException).code).toBe("forbidden");
  });

  it("rejects an orgless principal on a role-gated route", () => {
    const guard = new RolesGuard(reflectorReturning("VIEWER"));
    const error = thrownBy(() => guard.canActivate(contextFor(principal(null, null))));
    expect((error as ProblemException).code).toBe("forbidden");
  });

  it("rejects when no principal is present", () => {
    const guard = new RolesGuard(reflectorReturning("VIEWER"));
    const error = thrownBy(() => guard.canActivate(contextFor(undefined)));
    expect((error as ProblemException).code).toBe("unauthorized");
  });
});
