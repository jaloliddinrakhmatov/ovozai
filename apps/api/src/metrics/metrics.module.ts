import { Module } from "@nestjs/common";
import { MetricsController } from "./metrics.controller";
import { MetricsService } from "./metrics.service";
import { QueueMetrics } from "./queue-metrics";

/**
 * Observability metrics (Phase 7). Exposes GET /api/v1/metrics in Prometheus
 * format. MetricsService is exported so the global HttpMetricsInterceptor (wired
 * in AppModule) can record request counters + latency.
 */
@Module({
  controllers: [MetricsController],
  providers: [MetricsService, QueueMetrics],
  exports: [MetricsService],
})
export class MetricsModule {}
