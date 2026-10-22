import { randomUUID } from "node:crypto";
import type { NextFunction, Response } from "express";
import type { RequestWithContext } from "./principal.types";
import { runWithRequestId } from "./log-context";

/**
 * Assigns a correlation id to every request: honoring an inbound `X-Request-Id`
 * or generating one, exposing it on `req.requestId` and echoing it on the
 * response header for tracing (docs/API.md §6.2, docs/SECURITY.md §10). The rest
 * of the request runs inside a log-context so every log line carries the id
 * (Phase 7 observability).
 */
export function requestIdMiddleware(
  req: RequestWithContext,
  res: Response,
  next: NextFunction,
): void {
  const inbound = req.headers["x-request-id"];
  const requestId = (Array.isArray(inbound) ? inbound[0] : inbound) ?? randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  runWithRequestId(requestId, () => next());
}
