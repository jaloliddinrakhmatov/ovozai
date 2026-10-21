import { AsyncLocalStorage } from "node:async_hooks";

/** Request-scoped tenant context carried through async work via AsyncLocalStorage. */
export interface TenantStore {
  readonly organizationId: string;
}

/**
 * The active-tenant context. Populated per request by `TenantInterceptor` from
 * the authenticated principal's active organization, and read by the Prisma
 * tenant extension (see tenant.extension.ts) to scope every tenant-bound query.
 */
export const tenantContext = new AsyncLocalStorage<TenantStore>();

/** Run `fn` with `organizationId` bound as the active tenant. */
export function runWithTenant<T>(organizationId: string, fn: () => T): T {
  return tenantContext.run({ organizationId }, fn);
}

/** The active organization id, or `undefined` when no tenant context is set. */
export function currentOrganizationId(): string | undefined {
  return tenantContext.getStore()?.organizationId;
}
