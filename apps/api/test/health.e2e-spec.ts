import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("Health (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/health returns 200 and a liveness payload", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.service).toBe("api");
  });

  it("GET /api/v1/health/ready returns 200 or 503 with a details object", async () => {
    // Without PostgreSQL/Redis running this is expected to be 503; with them up, 200.
    const res = await request(app.getHttpServer()).get("/api/v1/health/ready");

    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty("details");
  });
});
