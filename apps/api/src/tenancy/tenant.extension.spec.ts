import { describe, expect, it } from "vitest";
import {
  CrossTenantAccessError,
  TenantContextMissingError,
  UnscopedOperationError,
  enforceTenantScope,
} from "./tenant.extension";

const ORG = "org-1";

describe("enforceTenantScope", () => {
  it("passes global models through untouched (even without a tenant context)", () => {
    const args = { where: { id: "u1" } };
    const out = enforceTenantScope({ model: "User", operation: "findUnique", args, organizationId: undefined });
    expect(out).toBe(args);
  });

  it("throws when a tenant-scoped model has no organization in scope", () => {
    expect(() =>
      enforceTenantScope({ model: "ApiKey", operation: "findMany", args: {}, organizationId: undefined }),
    ).toThrow(TenantContextMissingError);
  });

  it("injects organizationId into the where filter on reads", () => {
    const out = enforceTenantScope({
      model: "ApiKey",
      operation: "findMany",
      args: { where: { status: "ACTIVE" } },
      organizationId: ORG,
    }) as { where: Record<string, unknown> };
    expect(out.where.organizationId).toBe(ORG);
    expect(out.where.status).toBe("ACTIVE");
  });

  it("appends deletedAt: null for soft-deletable models on reads", () => {
    const out = enforceTenantScope({
      model: "ApiKey",
      operation: "findMany",
      args: {},
      organizationId: ORG,
    }) as { where: Record<string, unknown> };
    expect(out.where.organizationId).toBe(ORG);
    expect(out.where.deletedAt).toBeNull();
  });

  it("does not append deletedAt for non-soft-delete models", () => {
    const out = enforceTenantScope({
      model: "Invitation",
      operation: "findMany",
      args: {},
      organizationId: ORG,
    }) as { where: Record<string, unknown> };
    expect(out.where.organizationId).toBe(ORG);
    expect("deletedAt" in out.where).toBe(false);
  });

  it("stamps organizationId onto created rows", () => {
    const out = enforceTenantScope({
      model: "Invitation",
      operation: "create",
      args: { data: { email: "a@b.co" } },
      organizationId: ORG,
    }) as { data: Record<string, unknown> };
    expect(out.data.organizationId).toBe(ORG);
  });

  it("stamps each row of a createMany", () => {
    const out = enforceTenantScope({
      model: "Invitation",
      operation: "createMany",
      args: { data: [{ email: "a@b.co" }, { email: "c@d.co" }] },
      organizationId: ORG,
    }) as { data: Array<Record<string, unknown>> };
    expect(out.data.every((row) => row.organizationId === ORG)).toBe(true);
  });

  it("rejects a create carrying a foreign organizationId", () => {
    expect(() =>
      enforceTenantScope({
        model: "ApiKey",
        operation: "create",
        args: { data: { organizationId: "other-org", name: "k" } },
        organizationId: ORG,
      }),
    ).toThrow(CrossTenantAccessError);
  });

  it("rejects a read filtered by a foreign organizationId", () => {
    expect(() =>
      enforceTenantScope({
        model: "ApiKey",
        operation: "findMany",
        args: { where: { organizationId: "other-org" } },
        organizationId: ORG,
      }),
    ).toThrow(CrossTenantAccessError);
  });

  it("refuses by-unique-id operations that cannot carry a tenant filter", () => {
    for (const operation of ["findUnique", "update", "delete", "upsert"]) {
      expect(() =>
        enforceTenantScope({ model: "ApiKey", operation, args: { where: { id: "k1" } }, organizationId: ORG }),
      ).toThrow(UnscopedOperationError);
    }
  });
});
