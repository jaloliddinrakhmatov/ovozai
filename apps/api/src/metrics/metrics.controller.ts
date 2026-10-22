import { Controller, Get, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import { Public } from "../common/public.decorator";
import { Problems } from "../common/problem.exception";
import { MetricsService } from "./metrics.service";
import { QueueMetrics } from "./queue-metrics";

// Mounted under the global prefix → GET /api/v1/metrics. Unauthenticated (scraped
// by Prometheus); restrict network access at the ingress in production.
@Public()
@Controller()
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly queueMetrics: QueueMetrics,
    private readonly config: ConfigService,
  ) {}

  @Get("metrics")
  async scrape(@Res() res: Response): Promise<void> {
    if (this.config.get<boolean>("METRICS_ENABLED") === false) {
      throw Problems.notFound("Metrics are disabled.");
    }
    const queueLines = await this.queueMetrics.collect();
    res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    res.send(this.metrics.render(queueLines));
  }
}
