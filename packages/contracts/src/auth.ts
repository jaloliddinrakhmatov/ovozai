import { z } from "zod";
import { membershipRoleSchema } from "./rbac";
import { organizationDtoSchema } from "./organization";
import { userDtoSchema } from "./user";

/** Password policy for registration (hashing is argon2id server-side). */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(200, "Password must be at most 200 characters");

/** One of the caller's organization memberships, with the active-org context. */
export const membershipSummarySchema = z.object({
  organization: organizationDtoSchema,
  role: membershipRoleSchema,
});
export type MembershipSummary = z.infer<typeof membershipSummarySchema>;

/** The token pair issued on login/refresh. Access token is a short-lived JWT. */
export const authTokensSchema = z.object({
  tokenType: z.literal("Bearer"),
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Access-token lifetime in seconds. */
  expiresIn: z.number().int().positive(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

/** Full authenticated session returned by register/login/switch-org/accept. */
export const authSessionSchema = z.object({
  tokens: authTokensSchema,
  user: userDtoSchema,
  activeOrganization: organizationDtoSchema.nullable(),
  memberships: z.array(membershipSummarySchema),
});
export type AuthSession = z.infer<typeof authSessionSchema>;

export const registerRequestSchema = z.object({
  email: z.email(),
  password: passwordSchema,
  name: z.string().min(1).max(200).optional(),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export const switchOrgRequestSchema = z.object({
  organizationId: z.uuid(),
});
export type SwitchOrgRequest = z.infer<typeof switchOrgRequestSchema>;

/** `GET /auth/me` — the current user with memberships and active organization. */
export const meResponseSchema = z.object({
  user: userDtoSchema,
  activeOrganization: organizationDtoSchema.nullable(),
  memberships: z.array(membershipSummarySchema),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
