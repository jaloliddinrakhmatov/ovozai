import type { UsageRollupJob } from "@ovozai/contracts";
import type { PrismaClient } from "@ovozai/database";

export interface UsageRollupProcessorDeps {
  prisma: PrismaClient;
}

export interface UsageRollupResult {
  metrics: number;
}

/**
 * Aggregate raw UsageRecords for an organization + billing period into
 * UsageRollup rows (one per metric), upserting idempotently. `rawCount` records
 * how many source rows were summed, so a rollup is reconcilable against raw data.
 */
export async function processUsageRollupJob(
  deps: UsageRollupProcessorDeps,
  job: UsageRollupJob,
): Promise<UsageRollupResult> {
  const { prisma } = deps;
  const records = await prisma.usageRecord.findMany({
    where: { organizationId: job.organizationId, periodKey: job.periodKey },
    select: { metric: true, quantity: true },
  });

  type Metric = (typeof records)[number]["metric"];
  const buckets = new Map<Metric, { quantity: number; rawCount: number }>();
  for (const record of records) {
    const bucket = buckets.get(record.metric) ?? { quantity: 0, rawCount: 0 };
    bucket.quantity += Number(record.quantity);
    bucket.rawCount += 1;
    buckets.set(record.metric, bucket);
  }

  for (const [metric, bucket] of buckets) {
    await prisma.usageRollup.upsert({
      where: {
        organizationId_metric_periodKey: {
          organizationId: job.organizationId,
          metric,
          periodKey: job.periodKey,
        },
      },
      update: { quantity: bucket.quantity, rawCount: bucket.rawCount, computedAt: new Date() },
      create: {
        organizationId: job.organizationId,
        metric,
        periodKey: job.periodKey,
        quantity: bucket.quantity,
        rawCount: bucket.rawCount,
      },
    });
  }

  return { metrics: buckets.size };
}
