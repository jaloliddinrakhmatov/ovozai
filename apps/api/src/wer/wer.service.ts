import { Injectable } from "@nestjs/common";
import type { Language, WerSummaryResponse } from "@ovozai/contracts";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class WerService {
  constructor(private readonly prisma: PrismaService) {}

  /** Average WER per (provider, language) across the org's recorded samples. */
  async summary(): Promise<WerSummaryResponse> {
    const rows = await this.prisma.tenant.werMeasurement.findMany({
      select: { provider: true, language: true, wer: true },
    });

    const buckets = new Map<string, { provider: string; language: Language; sum: number; count: number }>();
    for (const row of rows) {
      const key = `${row.provider}|${row.language}`;
      const bucket = buckets.get(key) ?? { provider: row.provider, language: row.language, sum: 0, count: 0 };
      bucket.sum += row.wer;
      bucket.count += 1;
      buckets.set(key, bucket);
    }

    const items = [...buckets.values()]
      .map((b) => ({
        provider: b.provider,
        language: b.language,
        sampleCount: b.count,
        averageWer: b.count > 0 ? b.sum / b.count : 0,
      }))
      .sort((a, b) => a.provider.localeCompare(b.provider) || a.language.localeCompare(b.language));

    return { items };
  }
}
