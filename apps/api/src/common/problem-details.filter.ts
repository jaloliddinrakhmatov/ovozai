import { Catch, HttpException, Logger, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { ERROR_CODES, type ErrorCode } from "@ovozai/contracts";
import { ProblemException } from "./problem.exception";
import type { ProblemFieldError } from "./problem.exception";
import type { RequestWithContext } from "./principal.types";

const PROBLEM_TYPE_BASE = "https://docs.ovozai.uz/errors";

function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 401:
      return ERROR_CODES.unauthorized;
    case 403:
      return ERROR_CODES.forbidden;
    case 404:
      return ERROR_CODES.notFound;
    case 405:
      return ERROR_CODES.methodNotAllowed;
    case 409:
      return ERROR_CODES.conflict;
    case 413:
      return ERROR_CODES.payloadTooLarge;
    case 415:
      return ERROR_CODES.unsupportedMediaType;
    case 422:
      return ERROR_CODES.validationFailed;
    case 429:
      return ERROR_CODES.rateLimited;
    case 503:
      return ERROR_CODES.dependencyUnavailable;
    default:
      return ERROR_CODES.internalError;
  }
}

/** True for a Terminus health-check body, which must pass through unchanged. */
function isHealthPayload(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    ("details" in body || "info" in body) &&
    "status" in body
  );
}

/**
 * Global exception filter rendering RFC 9457 `application/problem+json` for all
 * errors (docs/API.md §3). The one documented exception is the Terminus health
 * body (§10.2), which is passed through as plain JSON so standard health tooling
 * keeps working.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<RequestWithContext>();
    const requestId = request.requestId ?? (request.headers["x-request-id"] as string | undefined);

    let status = 500;
    let code: ErrorCode = ERROR_CODES.internalError;
    let title = "Internal Server Error";
    let detail: string | undefined;
    let errors: ProblemFieldError[] | undefined;

    if (exception instanceof ProblemException) {
      status = exception.getStatus();
      code = exception.code;
      title = exception.title;
      detail = exception.detail;
      errors = exception.fieldErrors;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();

      // Preserve the Terminus health payload verbatim.
      if (isHealthPayload(body)) {
        response.status(status).json(body);
        return;
      }

      code = codeForStatus(status);
      title = exception.name.replace(/Exception$/, "") || "Error";
      if (typeof body === "string") {
        detail = body;
      } else if (typeof body === "object" && body !== null && "message" in body) {
        const message = (body as { message: unknown }).message;
        detail = Array.isArray(message) ? message.map((m) => String(m)).join("; ") : String(message);
      } else {
        detail = exception.message;
      }
    } else {
      // Unknown error: log the detail, return an opaque 500.
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      detail = "An unexpected error occurred.";
    }

    const problem = {
      type: `${PROBLEM_TYPE_BASE}/${code}`,
      title,
      status,
      ...(detail ? { detail } : {}),
      instance: request.url,
      code,
      ...(errors ? { errors } : {}),
      ...(requestId ? { requestId } : {}),
    };

    response.status(status).type("application/problem+json").json(problem);
  }
}
