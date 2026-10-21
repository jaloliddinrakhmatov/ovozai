import { config as loadEnv } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@ovozai/database";

const DEFAULT_DATABASE_URL = "postgresql://ovozai:ovozai@localhost:5432/ovozai?schema=public";

/** Load env from the package dir then the monorepo root (dotenv does not override). */
export function loadWorkerEnv(): void {
  loadEnv();
  loadEnv({ path: "../../.env" });
}

/** Construct the worker's Prisma client (unscoped base client via the pg adapter). */
export function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
