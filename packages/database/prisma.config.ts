import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Prisma 7 no longer auto-loads `.env`. Load it ourselves so the CLI
// (migrate / studio) picks up DATABASE_URL. We try the package directory first,
// then the monorepo root; dotenv does not override already-set variables.
loadEnv();
loadEnv({ path: "../../.env" });

// `prisma generate` does not connect to the database, so a dummy URL is fine
// when DATABASE_URL is unset (e.g. during a fresh `turbo build`). Migrations and
// Studio require a real, reachable DATABASE_URL (see .env.example / docker-compose).
const url = process.env.DATABASE_URL ?? "postgresql://ovozai:ovozai@localhost:5432/ovozai?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url,
  },
});
