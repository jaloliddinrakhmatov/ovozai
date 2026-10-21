import { describe, expect, it } from "vitest";
import { LocalSttProvider, createFallbackStt, textToAudio, type AudioChunk, type SttProvider } from "@ovozai/integrations";

async function* oneUtterance(text: string): AsyncIterable<AudioChunk> {
  yield textToAudio(text);
}

async function runFinal(provider: SttProvider, text: string): Promise<string> {
  let final = "";
  for await (const result of provider.transcribe(oneUtterance(text), { languages: ["en"] })) {
    if (result.isFinal) final = result.transcript;
  }
  return final;
}

const failing: SttProvider = {
  name: "down-provider",
  // eslint-disable-next-line require-yield
  async *transcribe(): AsyncIterable<never> {
    throw new Error("provider unavailable");
  },
};

describe("createFallbackStt", () => {
  it("fails over to the next provider on outage (survives a single-provider failure)", async () => {
    const chain = createFallbackStt([failing, new LocalSttProvider()]);
    expect(await runFinal(chain, "hello world")).toBe("hello world");
  });

  it("throws only when every provider fails", async () => {
    const chain = createFallbackStt([failing, failing]);
    await expect(runFinal(chain, "hello")).rejects.toThrow();
  });
});
