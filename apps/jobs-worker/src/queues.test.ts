import { describe, expect, it } from "vitest";

import { processJob, QUEUE_NAMES } from "./queues";

describe("processJob", () => {
  it("acknowledges a job and echoes its name", async () => {
    await expect(processJob({ name: "demo", data: {} })).resolves.toEqual({
      handled: true,
      name: "demo",
    });
  });
});

describe("QUEUE_NAMES", () => {
  it("exposes the default queue name", () => {
    expect(QUEUE_NAMES.default).toBe("ovozai:default");
  });
});
