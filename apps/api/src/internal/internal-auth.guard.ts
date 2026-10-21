import { createHmac, timingSafeEqual } from "node:crypto";
import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HEADERS } from "@ovozai/contracts";
import { Problems } from "../common/problem.exception";
import type { RequestWithContext } from "../common/principal.types";

interface RawBodyRequest extends RequestWithContext {
  rawBody?: Buffer;
}

function headerValue(req: RawBodyRequest, name: string): string | undefined {
  const raw = req.headers[name];
  return Array.isArray(raw) ? raw[0] : raw;
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function parseSignature(header: string): { t: number; v1: string } | null {
  const parts = header.split(",").map((p) => p.trim());
  let t: number | undefined;
  let v1: string | undefined;
  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "t" && value) t = Number(value);
    if (key === "v1" && value) v1 = value;
  }
  if (t === undefined || !Number.isFinite(t) || !v1) return null;
  return { t, v1 };
}

/**
 * Authenticates the internal voice-worker → API channel (docs/API.md §12/13,
 * SECURITY §2): a shared **service token** plus an **HMAC-SHA256 signature** over
 * `"<t>.<raw-body>"` with a timestamp freshness check to prevent replay. Requires
 * the raw request body (enabled via `rawBody: true` on the Nest app).
 */
@Injectable()
export class InternalAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RawBodyRequest>();

    const serviceToken = headerValue(req, HEADERS.serviceToken);
    const expectedToken = this.config.get<string>("INTERNAL_SERVICE_TOKEN") ?? "";
    if (!serviceToken || !constantTimeEqual(serviceToken, expectedToken)) {
      throw Problems.unauthorized("Invalid or missing service token.");
    }

    const signatureHeader = headerValue(req, HEADERS.signature);
    if (!signatureHeader) {
      throw Problems.unauthorized("Missing request signature.");
    }
    const parsed = parseSignature(signatureHeader);
    if (!parsed) {
      throw Problems.unauthorized("Malformed request signature.");
    }

    const maxAge = Number(this.config.get("INTERNAL_SIGNATURE_MAX_AGE_SECONDS") ?? 300);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parsed.t) > maxAge) {
      throw Problems.unauthorized("Request signature has expired.");
    }

    const rawBody = req.rawBody ? req.rawBody.toString("utf8") : "";
    const secret = this.config.get<string>("INTERNAL_HMAC_SECRET") ?? "";
    const expected = createHmac("sha256", secret).update(`${parsed.t}.${rawBody}`).digest("hex");
    if (!constantTimeEqual(parsed.v1, expected)) {
      throw Problems.unauthorized("Invalid request signature.");
    }

    return true;
  }
}
