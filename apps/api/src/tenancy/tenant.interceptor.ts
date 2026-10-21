import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import type { RequestWithContext } from "../common/principal.types";
import { tenantContext } from "./tenant-context";

/**
 * Binds the authenticated principal's active organization into the
 * AsyncLocalStorage tenant context for the duration of the request handler, so
 * the Prisma tenant extension can scope queries. Runs after the auth guards
 * (which set `req.principal`). Orgless/public requests pass through unbound.
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const organizationId = request.principal?.organizationId;
    if (!organizationId) {
      return next.handle();
    }
    return new Observable((subscriber) => {
      tenantContext.run({ organizationId }, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
