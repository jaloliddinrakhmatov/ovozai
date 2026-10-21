import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadVoiceWorkerConfig } from "./config";

const MANAGED = [
  "LIVEKIT_URL",
  "VOICE_WORKER_MAX_SESSIONS",
  "LOG_LEVEL",
  "VOICE_API_URL",
  "APP_API_URL",
  "VOICE_PROVIDER",
  "VOICE_PROVIDER_API_KEY",
];

describe("loadVoiceWorkerConfig", () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = process.env;
    process.env = { ...savedEnv };
    for (const key of MANAGED) delete process.env[key];
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  it("returns defaults when env vars are unset", () => {
    const config = loadVoiceWorkerConfig();

    expect(config.livekitUrl).toBe("");
    expect(config.maxConcurrentSessions).toBe(10);
    expect(config.logLevel).toBe("info");
    expect(config.apiBaseUrl).toBe("http://localhost:3001");
    expect(config.voiceProvider).toBe("local");
  });

  it("reads values from the environment when present", () => {
    process.env.LIVEKIT_URL = "ws://localhost:7880";
    process.env.VOICE_WORKER_MAX_SESSIONS = "25";
    process.env.LOG_LEVEL = "debug";
    process.env.VOICE_API_URL = "http://api.internal:3001";
    process.env.VOICE_PROVIDER = "openai";

    const config = loadVoiceWorkerConfig();

    expect(config.livekitUrl).toBe("ws://localhost:7880");
    expect(config.maxConcurrentSessions).toBe(25);
    expect(config.logLevel).toBe("debug");
    expect(config.apiBaseUrl).toBe("http://api.internal:3001");
    expect(config.voiceProvider).toBe("openai");
  });
});
