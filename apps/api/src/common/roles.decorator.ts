import { SetMetadata } from "@nestjs/common";
import type { MembershipRole } from "@ovozai/contracts";

/** Metadata key carrying the minimum required role for a route. */
export const ROLES_KEY = "ovozai:minRole";

/**
 * Require at least `minRole` (hierarchy-aware) for the route, within the active
 * organization. Enforced by `RolesGuard`; implies an org context must be present.
 */
export const Roles = (minRole: MembershipRole): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, minRole);
