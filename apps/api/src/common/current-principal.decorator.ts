import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Principal, RequestWithContext } from "./principal.types";

/** Inject the resolved request principal into a controller handler parameter. */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestWithContext>();
    return request.principal;
  },
);
