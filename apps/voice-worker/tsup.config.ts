import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  sourcemap: true,
  dts: false,
  // LiveKit SDKs are optional + dynamically imported (native bindings); never
  // bundle them — resolve from node_modules at runtime when configured.
  external: ["@livekit/rtc-node", "livekit-server-sdk"],
});
