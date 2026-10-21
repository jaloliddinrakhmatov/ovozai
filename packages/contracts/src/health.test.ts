import { describe, expect, it } from "vitest";
import { livenessResponseSchema, readinessResponseSchema } from "./health";

describe("livenessResponseSchema", () => {
  it("accepts a valid liveness payload", () => {
    const parsed = livenessResponseSchema.parse({
      status: "ok",
      service: "api",
      version: "0.1.0",
      uptimeSec: 12.3,
      timestamp: new Date().toISOString(),
    });
    expect(parsed.status).toBe("ok");
    expect(parsed.service).toBe("api");
  });

  it("rejects an invalid status", () => {
    expect(() =>
      livenessResponseSchema.parse({
        status: "nope",
        service: "api",
        version: "0.1.0",
        uptimeSec: 1,
        timestamp: "x",
      }),
    ).toThrow();
  });
});

describe("readinessResponseSchema", () => {
  it("accepts a healthy readiness payload", () => {
    const parsed = readinessResponseSchema.parse({
      status: "ok",
      info: { postgres: { status: "up" }, redis: { status: "up" } },
      details: { postgres: { status: "up" }, redis: { status: "up" } },
    });
    expect(parsed.status).toBe("ok");
    expect(parsed.details.postgres?.status).toBe("up");
  });

  it("accepts a degraded readiness payload with an error entry", () => {
    const parsed = readinessResponseSchema.parse({
      status: "error",
      error: { postgres: { status: "down", message: "connection refused" } },
      details: { postgres: { status: "down", message: "connection refused" }, redis: { status: "up" } },
    });
    expect(parsed.status).toBe("error");
    expect(parsed.error?.postgres?.status).toBe("down");
  });
});
