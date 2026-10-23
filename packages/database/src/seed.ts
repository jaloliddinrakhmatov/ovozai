import { config as loadEnv } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client";

// Load DATABASE_URL (Prisma 7 does not auto-load .env).
loadEnv();
loadEnv({ path: "../../.env" });

/**
 * Idempotent seed: platform plans + a ready-to-demo organization with a
 * login, a free subscription, and an ACTIVE Uzbek voice agent (salon
 * receptionist) so a public demo works out of the box — no knowledge-base
 * ingestion needed (the salon facts live in the agent's system prompt, and
 * booking/availability run server-side). Safe to run repeatedly.
 *
 * Public demo credentials (intentionally shareable):
 *   email: demo@ovozai.uz   password: ovozai-demo
 */
const DEMO_EMAIL = "demo@ovozai.uz";
const DEMO_PASSWORD = "ovozai-demo";
// argon2id hash of DEMO_PASSWORD (no pepper — matches PasswordService). Not a
// secret: this is a public demo account.
const DEMO_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,p=4,t=3$xLACd5uCr01L8mZ6KLw9SA$gUj2hS+M8jxIwS9oZ/SZiGe+jgNdgYZHfg8yGAWQQzc";
const DEMO_AGENT_ID = "d0000000-0000-4000-8000-000000000001";

const BUSINESS_HOURS: Record<string, string[][]> = {
  mon: [], // dushanba — dam olish kuni (closed)
  tue: [["10:00", "20:00"]],
  wed: [["10:00", "20:00"]],
  thu: [["10:00", "20:00"]],
  fri: [["10:00", "20:00"]],
  sat: [["10:00", "20:00"]],
  sun: [["10:00", "20:00"]],
};

const AGENT_CONFIG = {
  booking: {
    timezone: "Asia/Tashkent",
    slotMinutes: 30,
    capacity: 1,
    leadMinutes: 0,
    hours: BUSINESS_HOURS,
  },
};

const SYSTEM_PROMPT = [
  'Siz "Luxe Go\'zallik Saloni"ning AI qabulxona xodimisiz.',
  "Mijoz qaysi tilda yozsa/gapirsa — o'zbek, rus yoki ingliz — o'sha tilda muloyim va qisqa javob bering.",
  "",
  "Salon ma'lumotlari:",
  "- Manzil: Toshkent sh., Amir Temur ko'chasi 15.",
  "- Ish vaqti: har kuni 10:00–20:00; dushanba — dam olish kuni.",
  "- Xizmatlar va narxlar: soch oldirish 80 000 so'm, soch bo'yash 250 000 so'mdan,",
  "  manikyur 120 000 so'm, pedikyur 150 000 so'm, qosh/kiprik 90 000 so'm, make-up 200 000 so'm.",
  "- To'lov: naqd yoki karta.",
  "",
  "Vazifalaringiz:",
  "- Savollarga javob bering (ish vaqti, xizmatlar, narxlar).",
  "- Yozilishga yordam bering: sana, vaqt, xizmat va mijoz ismini aniqlang, so'ng bandlikni rasmiylashtiring.",
  "- Agar so'ralgan vaqt band bo'lsa, eng yaqin bo'sh vaqtlarni taklif qiling.",
  "- Kerak bo'lsa, operatorga ulang.",
  "Javoblaringiz qisqa (1–2 gap) va tabiiy bo'lsin.",
].join("\n");

const GREETING = "Assalomu alaykum! Luxe go'zallik saloniga xush kelibsiz. Sizga qanday yordam beraman?";

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
      update: { name: "Luxe Go'zallik Saloni" },
      create: { name: "Luxe Go'zallik Saloni", slug: "demo", locale: "uz" },
    });

    const user = await prisma.user.upsert({
      where: { email: DEMO_EMAIL },
      update: { name: "Demo Owner", hashedPassword: DEMO_PASSWORD_HASH },
      create: { email: DEMO_EMAIL, name: "Demo Owner", hashedPassword: DEMO_PASSWORD_HASH },
    });

    await prisma.membership.upsert({
      where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
      update: { role: "OWNER" },
      create: { organizationId: organization.id, userId: user.id, role: "OWNER" },
    });

    const freePlan = await prisma.plan.findUnique({ where: { code: "free" } });
    if (freePlan) {
      await prisma.subscription.upsert({
        where: { organizationId: organization.id },
        update: { planId: freePlan.id, status: "ACTIVE" },
        create: {
          organizationId: organization.id,
          planId: freePlan.id,
          status: "ACTIVE",
          currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
      });
    }

    const agent = await prisma.agent.upsert({
      where: { id: DEMO_AGENT_ID },
      update: {
        name: "Luxe Qabulxona",
        status: "ACTIVE",
        defaultLanguage: "UZ",
        systemPrompt: SYSTEM_PROMPT,
        greeting: GREETING,
        voiceId: "kamron",
        config: AGENT_CONFIG,
      },
      create: {
        id: DEMO_AGENT_ID,
        organizationId: organization.id,
        name: "Luxe Qabulxona",
        status: "ACTIVE",
        defaultLanguage: "UZ",
        systemPrompt: SYSTEM_PROMPT,
        greeting: GREETING,
        voiceId: "kamron",
        config: AGENT_CONFIG,
      },
    });

    await prisma.agentVersion.upsert({
      where: { agentId_version: { agentId: agent.id, version: 1 } },
      update: { config: AGENT_CONFIG },
      create: { agentId: agent.id, organizationId: organization.id, version: 1, config: AGENT_CONFIG },
    });

    console.log(`Seeded organization "${organization.slug}" with owner ${user.email}`);
    console.log(`Seeded ACTIVE agent "${agent.name}" (${agent.id})`);
    console.log(`\nDemo login →  ${DEMO_EMAIL}  /  ${DEMO_PASSWORD}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
