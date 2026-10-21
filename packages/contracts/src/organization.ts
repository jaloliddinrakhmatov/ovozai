import { z } from "zod";

/** Lifecycle state of a tenant organization (mirrors the DB enum). */
export const organizationStatusSchema = z.enum(["ACTIVE", "SUSPENDED"]);
export type OrganizationStatus = z.infer<typeof organizationStatusSchema>;

/** URL-safe organization slug: lowercase alphanumeric with internal hyphens. */
export const slugSchema = z
  .string()
  .min(2)
  .max(63)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Slug must be lowercase alphanumeric with hyphens");

/** Public representation of an organization. */
export const organizationDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  status: organizationStatusSchema,
  locale: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type OrganizationDto = z.infer<typeof organizationDtoSchema>;

export const createOrganizationRequestSchema = z.object({
  name: z.string().min(1).max(200),
  /** Optional; derived from `name` when omitted. */
  slug: slugSchema.optional(),
});
export type CreateOrganizationRequest = z.infer<typeof createOrganizationRequestSchema>;

export const updateOrganizationRequestSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    locale: z.string().min(2).max(35).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdateOrganizationRequest = z.infer<typeof updateOrganizationRequestSchema>;
