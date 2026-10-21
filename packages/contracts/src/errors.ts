/**
 * Stable, machine-readable error codes (docs/API.md §4). Clients branch on the
 * `code` field of a problem+json body rather than on human-readable `title`.
 */
export const ERROR_CODES = {
  unauthorized: "unauthorized",
  invalidToken: "invalid_token",
  forbidden: "forbidden",
  forbiddenOrgMismatch: "forbidden_org_mismatch",
  notFound: "not_found",
  methodNotAllowed: "method_not_allowed",
  conflict: "conflict",
  idempotencyKeyReuse: "idempotency_key_reuse",
  unprocessableEntity: "unprocessable_entity",
  validationFailed: "validation_failed",
  rateLimited: "rate_limited",
  payloadTooLarge: "payload_too_large",
  unsupportedMediaType: "unsupported_media_type",
  dependencyUnavailable: "dependency_unavailable",
  internalError: "internal_error",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
