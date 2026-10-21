import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { roleSatisfies, type MembershipRole } from "@ovozai/contracts";
import { ROLES_KEY } from "../common/roles.decorator";
import { Problems } from "../common/problem.exception";
import type { RequestWithContext } from "../common/principal.types";

/**
 * Global role guard, deny-by-default for `@Roles(...)` routes. A role requirement
 * implies an active-organization context: an orgless principal, or one whose role
 * is below the minimum, is rejected. Routes without `@Roles` only require
 * authentication (enforced by `JwtAuthGuard`).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const minRole = this.reflector.getAllAndOverride<MembershipRole | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!minRole) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const principal = request.principal;
    if (!principal) {
      throw Problems.unauthorized();
    }
    if (!principal.organizationId || !principal.role) {
      throw Problems.forbidden("This action requires an active organization membership.");
    }
    if (!roleSatisfies(principal.role, minRole)) {
      throw Problems.forbidden(`This action requires at least the ${minRole} role.`);
    }
    return true;
  }
}
