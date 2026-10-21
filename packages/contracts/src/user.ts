import { z } from "zod";

/** Lifecycle state of a user account (mirrors the DB `UserStatus` enum). */
export const userStatusSchema = z.enum(["ACTIVE", "DISABLED"]);
export type UserStatus = z.infer<typeof userStatusSchema>;

/**
 * Public representation of a user. The password hash is never serialized.
 * Timestamps are ISO-8601 strings (see docs/API.md §1).
 */
export const userDtoSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string().nullable(),
  status: userStatusSchema,
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});
export type UserDto = z.infer<typeof userDtoSchema>;
