import { z } from "zod";

/**
 * Tenant-scoped RBAC roles, stored on `Membership`. `AGENT_OPERATOR` is reserved
 * for a later phase and intentionally absent here.
 *
 * See docs/SECURITY.md §3 and docs/API.md §2.5.
 */
export const membershipRoleSchema = z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]);
export type MembershipRole = z.infer<typeof membershipRoleSchema>;

/**
 * Privilege rank for the role hierarchy `OWNER ⊇ ADMIN ⊇ MEMBER ⊇ VIEWER`.
 * A higher rank satisfies any lower "minimum required role".
 */
export const ROLE_RANK: Record<MembershipRole, number> = {
  OWNER: 40,
  ADMIN: 30,
  MEMBER: 20,
  VIEWER: 10,
};

/** True when `role` meets or exceeds the `minimum` required role. */
export function roleSatisfies(role: MembershipRole, minimum: MembershipRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}
