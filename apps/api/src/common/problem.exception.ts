import { HttpException } from "@nestjs/common";
import { ERROR_CODES, type ErrorCode } from "@ovozai/contracts";

/** A single field-level validation error (RFC 9457 `errors[]` extension). */
export interface ProblemFieldError {
  path: string;
  message: string;
  code?: string;
}

export interface ProblemOptions {
  status: number;
  code: ErrorCode;
  title: string;
  detail?: string;
  errors?: ProblemFieldError[];
}

/**
 * An HTTP exception that carries the fields needed to render an RFC 9457
 * problem+json body (see docs/API.md §3). The `ProblemDetailsFilter` formats it.
 */
export class ProblemException extends HttpException {
  readonly code: ErrorCode;
  readonly title: string;
  readonly detail?: string;
  readonly fieldErrors?: ProblemFieldError[];

  constructor(options: ProblemOptions) {
    super(options.title, options.status);
    this.code = options.code;
    this.title = options.title;
    this.detail = options.detail;
    this.fieldErrors = options.errors;
  }
}

/** Factory helpers for the common problem types. */
export const Problems = {
  unauthorized: (detail?: string): ProblemException =>
    new ProblemException({ status: 401, code: ERROR_CODES.unauthorized, title: "Unauthorized", detail }),
  invalidToken: (detail?: string): ProblemException =>
    new ProblemException({ status: 401, code: ERROR_CODES.invalidToken, title: "Invalid token", detail }),
  forbidden: (detail?: string): ProblemException =>
    new ProblemException({ status: 403, code: ERROR_CODES.forbidden, title: "Forbidden", detail }),
  forbiddenOrgMismatch: (detail?: string): ProblemException =>
    new ProblemException({
      status: 403,
      code: ERROR_CODES.forbiddenOrgMismatch,
      title: "Organization mismatch",
      detail,
    }),
  notFound: (detail?: string): ProblemException =>
    new ProblemException({ status: 404, code: ERROR_CODES.notFound, title: "Not found", detail }),
  conflict: (detail?: string): ProblemException =>
    new ProblemException({ status: 409, code: ERROR_CODES.conflict, title: "Conflict", detail }),
  unprocessable: (detail?: string): ProblemException =>
    new ProblemException({
      status: 422,
      code: ERROR_CODES.unprocessableEntity,
      title: "Unprocessable entity",
      detail,
    }),
  validation: (errors: ProblemFieldError[], detail?: string): ProblemException =>
    new ProblemException({
      status: 422,
      code: ERROR_CODES.validationFailed,
      title: "Validation failed",
      detail: detail ?? "The request failed schema validation.",
      errors,
    }),
  rateLimited: (detail?: string): ProblemException =>
    new ProblemException({ status: 429, code: ERROR_CODES.rateLimited, title: "Too many requests", detail }),
} as const;
