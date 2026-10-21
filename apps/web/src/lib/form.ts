import type { ZodError } from "zod";
import { ApiError } from "./api-client";

/** Field errors keyed by the first path segment (e.g. `email`, `password`). */
export type FieldErrors = Record<string, string>;

/** Flatten a {@link ZodError} into one message per top-level field. */
export function zodFieldErrors(error: ZodError): FieldErrors {
  const result: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : "_form";
    if (!(key in result)) {
      result[key] = issue.message;
    }
  }
  return result;
}

/**
 * Turn any thrown value into a user-facing message plus optional field errors.
 * {@link ApiError} carries problem+json detail and per-field errors; anything
 * else degrades to a generic connection message.
 */
export function describeError(error: unknown): { message: string; fieldErrors: FieldErrors } {
  if (error instanceof ApiError) {
    return { message: error.message, fieldErrors: error.fieldErrors };
  }
  if (error instanceof Error) {
    return { message: error.message, fieldErrors: {} };
  }
  return { message: "Something went wrong. Please try again.", fieldErrors: {} };
}
