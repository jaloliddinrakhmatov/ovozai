import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadVoiceWorkerConfig } from "./config";

describe("loadVoiceWorkerConfig", () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Snapshot and reset the relevant env so each case is deterministic.
    savedEnv = process.env;
    process.env = { ...savedEnv };
    delete process.env.LIVEKIT_URL;
    delete process.env.VOICE_WORKER_MAX_SESSIONS;
    delete process.env.LOG_LEVEL;
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  it("returns defaults when env vars are unset", () => {
    const config = loadVoiceWorkerConfig();

    expect(config.livekitUrl).toBe("");
    expect(config.maxConcurrentSessions).toBe(10);
    expect(config.logLevel).toBe("info");
  });

  it("reads values from the environment when present", () => {
    process.env.LIVEKIT_URL = "ws://localhost:7880";
    process.env.VOICE_WORKER_MAX_SESSIONS = "25";
    process.env.LOG_LEVEL = "debug";

    const config = loadVoiceWorkerConfig();

    expect(config.livekitUrl).toBe("ws://localhost:7880");
    expect(config.maxConcurrentSessions).toBe(25);
    expect(config.logLevel).toBe("debug");
  });
});
