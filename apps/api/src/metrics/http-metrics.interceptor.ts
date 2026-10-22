import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from "@nestjs/common";
import type { Observable } from "rxjs";
import { finalize } from "rxjs/operators";
import type { Request, Response } from "express";
import { MetricsService } from "./metrics.service";

/**
 * Times every HTTP request and records method/route/status + latency into the
 * MetricsService (Phase 7). Routes are recorded as their matched pattern
 * (`req.route.path`), not the concrete URL, to keep label cardinality bounded.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { route?: { path?: string } }>();
    const start = Date.now();
    return next.handle().pipe(
      finalize(() => {
        const res = http.getResponse<Response>();
        const route = req.route?.path ?? req.path ?? "unknown";
        this.metrics.recordRequest(req.method, route, res.statusCode, Date.now() - start);
      }),
    );
  }
}
