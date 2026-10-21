import { z } from "zod";
import { membershipRoleSchema } from "./rbac";
import { userDtoSchema } from "./user";

/** A user's membership in an organization, carrying their RBAC role. */
export const membershipDtoSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  userId: z.uuid(),
  role: membershipRoleSchema,
  invitedAt: z.string().nullable(),
  acceptedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type MembershipDto = z.infer<typeof membershipDtoSchema>;

/** A membership joined with its user — used by the member-list screen. */
export const membershipWithUserDtoSchema = membershipDtoSchema.extend({
  user: userDtoSchema,
});
export type MembershipWithUserDto = z.infer<typeof membershipWithUserDtoSchema>;

/** Lifecycle state of a membership invitation (mirrors the DB enum). */
export const invitationStatusSchema = z.enum(["PENDING", "ACCEPTED", "REVOKED", "EXPIRED"]);
export type InvitationStatus = z.infer<typeof invitationStatusSchema>;

/**
 * Roles that may be assigned via invitation. OWNER is excluded: ownership is
 * conferred at org creation and transferred by an explicit, OWNER-only action.
 */
export const invitableRoleSchema = z.enum(["ADMIN", "MEMBER", "VIEWER"]);
export type InvitableRole = z.infer<typeof invitableRoleSchema>;

export const invitationDtoSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  email: z.email(),
  role: membershipRoleSchema,
  status: invitationStatusSchema,
  expiresAt: z.string(),
  createdAt: z.string(),
});
export type InvitationDto = z.infer<typeof invitationDtoSchema>;

/**
 * Invitation as returned once at creation. `token` is the raw acceptance token,
 * returned a single time so it can be delivered to the invitee (email delivery
 * lands in a later phase); only its hash is persisted.
 */
export const invitationCreatedDtoSchema = invitationDtoSchema.extend({
  token: z.string(),
  acceptPath: z.string(),
});
export type InvitationCreatedDto = z.infer<typeof invitationCreatedDtoSchema>;

export const createInvitationRequestSchema = z.object({
  email: z.email(),
  role: invitableRoleSchema.default("MEMBER"),
});
export type CreateInvitationRequest = z.infer<typeof createInvitationRequestSchema>;

export const updateMembershipRoleRequestSchema = z.object({
  role: membershipRoleSchema,
});
export type UpdateMembershipRoleRequest = z.infer<typeof updateMembershipRoleRequestSchema>;
