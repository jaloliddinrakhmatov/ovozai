import type { RequestWithContext } from "./principal.types";

/** Per-request context (user agent + client IP) for auditing/session metadata. */
export interface RequestMeta {
  userAgent?: string;
  ip?: string;
}

export function requestContextFrom(req: RequestWithContext): RequestMeta {
  const userAgent = req.headers["user-agent"];
  return { userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent, ip: req.ip };
}
