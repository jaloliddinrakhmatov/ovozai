import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

/**
 * Object-storage abstraction for call recordings (docs/VOICE_PIPELINE.md §8,
 * SECURITY §4). Keys are tenant-scoped by the caller (e.g.
 * `org/<orgId>/calls/<callId>/recording.opus`). The local-filesystem provider is
 * the no-dependency default for dev/tests; a real S3-compatible provider plugs in
 * for deployment.
 */
export interface StorageProvider {
  readonly name: string;
  put(key: string, data: Uint8Array, contentType?: string): Promise<void>;
  /** A retrievable URL for the object, or null if unavailable. */
  getUrl(key: string, expiresInSeconds?: number): Promise<string | null>;
  /** Permanently remove an object (idempotent — deleting a missing key is a
   *  no-op). Used by data-retention sweeps and right-to-erasure (Phase 7). */
  delete(key: string): Promise<void>;
}

/** Writes objects under a base directory. getUrl returns a `file://` URL. */
export class LocalFsStorageProvider implements StorageProvider {
  readonly name = "local-fs";
  constructor(private readonly baseDir: string) {}

  async put(key: string, data: Uint8Array): Promise<void> {
    const path = join(this.baseDir, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  async getUrl(key: string): Promise<string | null> {
    return `file://${resolve(join(this.baseDir, key))}`;
  }

  async delete(key: string): Promise<void> {
    await rm(join(this.baseDir, key), { force: true });
  }
}

export interface S3StorageConfig {
  bucket: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

/**
 * S3-compatible provider. Implementing PUT + presigned GET requires an S3 client
 * (AWS SigV4 signing); it is a deployment dependency not available in this
 * environment, so the methods document that boundary rather than fake success.
 */
export class S3StorageProvider implements StorageProvider {
  readonly name = "s3";
  constructor(private readonly config: S3StorageConfig) {}

  async put(): Promise<void> {
    throw new Error(
      `S3 storage (bucket ${this.config.bucket}) is not wired in this build. ` +
        "Add an S3 client (SigV4) to implement put/getUrl (see docs/VOICE_PIPELINE.md §8).",
    );
  }

  async getUrl(): Promise<string | null> {
    return null;
  }

  async delete(): Promise<void> {
    throw new Error(
      `S3 storage (bucket ${this.config.bucket}) is not wired in this build. ` +
        "Add an S3 client (DeleteObject) to implement delete (see docs/VOICE_PIPELINE.md §8).",
    );
  }
}

export interface StorageConfig extends Partial<S3StorageConfig> {
  provider?: "local" | "s3";
  baseDir?: string;
}

/** Build a storage provider from config; defaults to the local-fs provider. */
export function createStorageProvider(config: StorageConfig = {}): StorageProvider {
  if (config.provider === "s3") {
    return new S3StorageProvider({
      bucket: config.bucket ?? "ovozai-recordings",
      region: config.region,
      endpoint: config.endpoint,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    });
  }
  // Default to a shared temp dir so co-located processes (api + voice-worker)
  // resolve the same keys without extra config.
  return new LocalFsStorageProvider(config.baseDir ?? join(tmpdir(), "ovozai-storage"));
}
