import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { requestIdMiddleware } from "../src/common/request-id.middleware";

/**
 * Offline e2e: validates auth wiring (validation pipe, guards, problem+json
 * filter, request-id middleware) WITHOUT a database. The requests exercised here
 * are rejected before any DB access, so they pass with Postgres/Redis down.
 * Full auth-flow e2e against a live database is run separately after setup.
 */
describe("Auth wiring (e2e, offline)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(requestIdMiddleware);
    app.setGlobalPrefix("api/v1");
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects an invalid login body with 422 problem+json and field errors", async () => {
    const res = await request(app.getHttpServer()).post("/api/v1/auth/login").send({});

    expect(res.status).toBe(422);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.body.code).toBe("validation_failed");
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.headers["x-request-id"]).toBeDefined();
  });

  it("rejects a weak registration password with 422", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: "new@user.co", password: "short" });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("validation_failed");
  });

  it("returns 401 unauthorized for a protected route without a token", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/auth/me");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("unauthorized");
  });

  it("returns 401 invalid_token for a bogus bearer token", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer not-a-real-jwt");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("invalid_token");
  });

  it("protects a tenant route without authentication", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/organizations/current");

    expect(res.status).toBe(401);
  });
});
