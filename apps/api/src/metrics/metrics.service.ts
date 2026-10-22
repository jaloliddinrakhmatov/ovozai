import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

const DURATION_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

/**
 * In-process metrics registry rendered in Prometheus text exposition format
 * (Phase 7 observability, docs/COMPLIANCE.md §5). Deliberately dependency-free
 * (no prom-client) — HTTP request counters + a latency histogram + process gauges,
 * scraped at GET /api/v1/metrics.
 */
@Injectable()
export class MetricsService {
  private readonly requests = new Map<string, number>();
  private readonly bucketCounts = new Array<number>(DURATION_BUCKETS_MS.length + 1).fill(0);
  private durationSum = 0;
  private durationCount = 0;

  constructor(private readonly config: ConfigService) {}

  recordRequest(method: string, route: string, status: number, durationMs: number): void {
    const key = `${method}|${route}|${status}`;
    this.requests.set(key, (this.requests.get(key) ?? 0) + 1);
    this.durationSum += durationMs;
    this.durationCount += 1;
    for (let i = 0; i < DURATION_BUCKETS_MS.length; i += 1) {
      if (durationMs <= DURATION_BUCKETS_MS[i]!) this.bucketCounts[i]! += 1;
    }
    this.bucketCounts[DURATION_BUCKETS_MS.length]! += 1; // +Inf
  }

  /** Render the full exposition, appending any `extra` lines (e.g. queue gauges). */
  render(extra: string[] = []): string {
    const lines: string[] = [];

    lines.push("# HELP ovozai_http_requests_total Total HTTP requests by method, route and status.");
    lines.push("# TYPE ovozai_http_requests_total counter");
    for (const [key, count] of this.requests) {
      const [method, route, status] = key.split("|");
      lines.push(
        `ovozai_http_requests_total{method="${esc(method)}",route="${esc(route)}",status="${esc(status)}"} ${count}`,
      );
    }

    lines.push("# HELP ovozai_http_request_duration_ms Request latency histogram (ms).");
    lines.push("# TYPE ovozai_http_request_duration_ms histogram");
    for (let i = 0; i < DURATION_BUCKETS_MS.length; i += 1) {
      lines.push(`ovozai_http_request_duration_ms_bucket{le="${DURATION_BUCKETS_MS[i]}"} ${this.bucketCounts[i]}`);
    }
    lines.push(`ovozai_http_request_duration_ms_bucket{le="+Inf"} ${this.durationCount}`);
    lines.push(`ovozai_http_request_duration_ms_sum ${this.durationSum}`);
    lines.push(`ovozai_http_request_duration_ms_count ${this.durationCount}`);

    const mem = process.memoryUsage();
    lines.push("# HELP process_uptime_seconds Process uptime in seconds.");
    lines.push("# TYPE process_uptime_seconds gauge");
    lines.push(`process_uptime_seconds ${Math.round(process.uptime())}`);
    lines.push("# HELP process_resident_memory_bytes Resident memory size in bytes.");
    lines.push("# TYPE process_resident_memory_bytes gauge");
    lines.push(`process_resident_memory_bytes ${mem.rss}`);
    lines.push("# HELP nodejs_heap_used_bytes V8 heap used in bytes.");
    lines.push("# TYPE nodejs_heap_used_bytes gauge");
    lines.push(`nodejs_heap_used_bytes ${mem.heapUsed}`);

    const version = process.env.npm_package_version ?? "0.1.0";
    const region = this.config.get<string>("DATA_REGION") ?? "uz";
    lines.push("# HELP ovozai_build_info Build/runtime info (value is always 1).");
    lines.push("# TYPE ovozai_build_info gauge");
    lines.push(`ovozai_build_info{version="${esc(version)}",data_region="${esc(region)}"} 1`);

    lines.push(...extra);
    return lines.join("\n") + "\n";
  }
}

function esc(value: string | undefined): string {
  return (value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
