import type { Request } from "express";
import type { MembershipRole } from "@ovozai/contracts";

/**
 * An authenticated user principal, resolved by `JwtAuthGuard` from a verified
 * access token and the live `Membership`. `organizationId`/`role` are null for an
 * "orgless" user (registered but not yet in any organization).
 */
export interface UserPrincipal {
  readonly type: "user";
  readonly userId: string;
  readonly sessionId: string;
  readonly organizationId: string | null;
  readonly role: MembershipRole | null;
}

/** Request principal. A union once API-key principals arrive in a later phase. */
export type Principal = UserPrincipal;

/** Express request augmented with the resolved principal and correlation id. */
export interface RequestWithContext extends Request {
  principal?: Principal;
  requestId?: string;
}
