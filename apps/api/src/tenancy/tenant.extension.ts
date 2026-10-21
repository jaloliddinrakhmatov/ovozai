import { Prisma } from "@ovozai/database";
import { currentOrganizationId } from "./tenant-context";

/**
 * Prisma client extension enforcing multi-tenant isolation (docs/DATABASE.md §4,
 * docs/SECURITY.md §4). For every operation on a tenant-scoped model it:
 *   - injects the active `organizationId` into the `where` filter (reads + bulk
 *     writes), so queries cannot span tenants;
 *   - stamps `organizationId` onto created rows, rejecting a spoofed value;
 *   - refuses by-unique-id operations (findUnique/update/delete/upsert), whose
 *     `where` cannot carry a tenant filter — callers must use the findFirst /
 *     updateMany / deleteMany variants so the tenant scope is always applied;
 *   - appends `deletedAt: null` to reads of soft-deletable models.
 *
 * Global models (User, Organization, Membership, Session, AuditLog) are not in
 * the scoped set and pass through untouched. The set grows as later phases add
 * tenant-scoped tables (Agent, Call, …).
 */
const TENANT_SCOPED = new Set<string>([
  "ApiKey",
  "Invitation",
  "Agent",
  "AgentVersion",
  "KnowledgeBase",
  "KnowledgeDocument",
  "KnowledgeChunk",
  "Customer",
  "Appointment",
  "Call",
  "CallEvent",
  "Transcript",
  "TranscriptTurn",
  "UsageRecord",
  "PhoneNumber",
  "WebhookEndpoint",
  "WebhookDelivery",
  "WerMeasurement",
]);
const SOFT_DELETE_MODELS = new Set<string>([
  "ApiKey",
  "Agent",
  "KnowledgeBase",
  "KnowledgeDocument",
  "Customer",
  "PhoneNumber",
  "WebhookEndpoint",
]);

const WHERE_OPS = new Set<string>([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "deleteMany",
]);
const CREATE_OPS = new Set<string>(["create", "createMany", "createManyAndReturn"]);
const DISALLOWED_OPS = new Set<string>([
  "findUnique",
  "findUniqueOrThrow",
  "update",
  "delete",
  "upsert",
]);

/** Thrown when a tenant-scoped query runs with no active organization in scope. */
export class TenantContextMissingError extends Error {
  constructor(model: string, operation: string) {
    super(`Tenant context missing for ${model}.${operation}: no active organization in scope`);
    this.name = "TenantContextMissingError";
  }
}

/** Thrown when an operation carries an `organizationId` other than the active tenant. */
export class CrossTenantAccessError extends Error {
  constructor(model: string) {
    super(`Cross-tenant access blocked on ${model}: organizationId does not match the active tenant`);
    this.name = "CrossTenantAccessError";
  }
}

/** Thrown when a by-unique-id operation is attempted on a tenant-scoped model. */
export class UnscopedOperationError extends Error {
  constructor(model: string, operation: string) {
    super(
      `Operation ${model}.${operation} cannot be tenant-scoped safely; ` +
        `use findFirst / findMany / updateMany / deleteMany instead`,
    );
    this.name = "UnscopedOperationError";
  }
}

function stampCreateData(data: unknown, org: string, model: string): unknown {
  if (data == null || typeof data !== "object") return data;
  if (Array.isArray(data)) return data.map((item) => stampCreateData(item, org, model));
  const record = data as Record<string, unknown>;
  if (record.organizationId != null && record.organizationId !== org) {
    throw new CrossTenantAccessError(model);
  }
  return { ...record, organizationId: org };
}

/**
 * Pure tenant-scoping decision applied to a Prisma operation's args. Returns the
 * (possibly new) args to run, or throws for a missing context / cross-tenant
 * attempt / unsafe operation. Extracted from the extension so it is unit-testable
 * without a live database.
 */
export function enforceTenantScope(params: {
  model: string;
  operation: string;
  args: unknown;
  organizationId: string | undefined;
}): unknown {
  const { model, operation, args, organizationId } = params;
  if (!TENANT_SCOPED.has(model)) {
    return args;
  }
  if (!organizationId) {
    throw new TenantContextMissingError(model, operation);
  }
  if (DISALLOWED_OPS.has(operation)) {
    throw new UnscopedOperationError(model, operation);
  }

  const mutable = (args ?? {}) as { where?: Record<string, unknown>; data?: unknown };

  if (CREATE_OPS.has(operation) && "data" in mutable) {
    mutable.data = stampCreateData(mutable.data, organizationId, model);
  }

  if (WHERE_OPS.has(operation)) {
    const where = { ...(mutable.where ?? {}) };
    if (where.organizationId != null && where.organizationId !== organizationId) {
      throw new CrossTenantAccessError(model);
    }
    where.organizationId = organizationId;
    if (SOFT_DELETE_MODELS.has(model) && !("deletedAt" in where)) {
      where.deletedAt = null;
    }
    mutable.where = where;
  }

  return mutable;
}

export const tenantExtension = Prisma.defineExtension({
  name: "tenant-isolation",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        // `query` is a correlated union across operations; cast to a permissive
        // callable so the scoped args (which may be a fresh object) can be passed.
        const run = query as unknown as (a: unknown) => Promise<unknown>;
        if (!model) {
          return run(args);
        }
        return run(
          enforceTenantScope({
            model,
            operation,
            args,
            organizationId: currentOrganizationId(),
          }),
        );
      },
    },
  },
});
