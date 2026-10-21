import { SetMetadata } from "@nestjs/common";

/** Metadata key marking a route as public (skips authentication). */
export const IS_PUBLIC_KEY = "ovozai:public";

/** Mark a route or controller as publicly accessible (no access token required). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
