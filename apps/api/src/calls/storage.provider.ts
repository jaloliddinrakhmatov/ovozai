import type { Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createStorageProvider, type StorageProvider } from "@ovozai/integrations";

/** DI token for the recording storage provider. */
export const STORAGE_PROVIDER = Symbol("STORAGE_PROVIDER");

/** Builds the storage provider from env; must match the voice-worker's config. */
export const storageProvider: Provider = {
  provide: STORAGE_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService): StorageProvider =>
    createStorageProvider({
      provider: config.get<"local" | "s3">("STORAGE_PROVIDER") ?? "local",
      baseDir: config.get<string>("STORAGE_LOCAL_DIR"),
      bucket: config.get<string>("STORAGE_S3_BUCKET"),
      region: config.get<string>("STORAGE_S3_REGION"),
      endpoint: config.get<string>("STORAGE_S3_ENDPOINT"),
    }),
};
