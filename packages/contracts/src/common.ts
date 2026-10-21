import { z } from "zod";

/**
 * RFC 9457 "problem+json" error body used by all API error responses.
 * See docs/API.md for the error-code catalog.
 */
export const problemDetailsSchema = z.object({
  type: z.string().default("about:blank"),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  /** Machine-readable application error code, e.g. "validation_error". */
  code: z.string().optional(),
  /** Field-level validation errors, when applicable. */
  errors: z
    .array(
      z.object({
        path: z.string(),
        message: z.string(),
      }),
    )
    .optional(),
});
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

/** Cursor-pagination metadata returned alongside list responses. */
export const pageInfoSchema = z.object({
  nextCursor: z.string().nullable(),
  hasNextPage: z.boolean(),
});
export type PageInfo = z.infer<typeof pageInfoSchema>;
