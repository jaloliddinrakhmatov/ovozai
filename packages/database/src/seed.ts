import { config as loadEnv } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client";

// Load DATABASE_URL (Prisma 7 does not auto-load .env).
loadEnv();
loadEnv({ path: "../../.env" });

/**
 * Idempotent development seed: a demo organization with an owner.
 * Requires a running PostgreSQL (`pnpm docker:up`) and an applied migration
 * (`pnpm db:migrate:deploy`). Safe to run repeatedly.
 */
async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and start PostgreSQL (`pnpm docker:up`).",
    );
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    // Platform plan catalog (safe in all environments, including production).
    const plans = [
      { code: "free", name: "Free", priceCents: 0, limits: { maxAgents: 1, includedMinutes: 100 } },
      { code: "starter", name: "Starter", priceCents: 49_000_000, limits: { maxAgents: 5, includedMinutes: 1000 } },
      { code: "growth", name: "Growth", priceCents: 149_000_000, limits: { maxAgents: 20, includedMinutes: 5000 } },
    ];
    for (const plan of plans) {
      await prisma.plan.upsert({
        where: { code: plan.code },
        update: { name: plan.name, priceCents: plan.priceCents, limits: plan.limits, currency: "UZS" },
        create: { ...plan, currency: "UZS" },
      });
    }
    console.log(`Seeded ${plans.length} plans`);

    const organization = await prisma.organization.upsert({
      where: { slug: "demo" },
      update: {},
      create: { name: "Demo Organization", slug: "demo", locale: "uz" },
    });

    const user = await prisma.user.upsert({
      where: { email: "owner@demo.ovoz.ai" },
      update: {},
      create: { email: "owner@demo.ovoz.ai", name: "Demo Owner" },
    });

    await prisma.membership.upsert({
      where: {
        organizationId_userId: { organizationId: organization.id, userId: user.id },
      },
      update: { role: "OWNER" },
      create: { organizationId: organization.id, userId: user.id, role: "OWNER" },
    });

    console.log(`Seeded organization "${organization.slug}" with owner ${user.email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
