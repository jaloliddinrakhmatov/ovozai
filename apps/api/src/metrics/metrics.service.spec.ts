import { describe, expect, it } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { MetricsService } from "./metrics.service";

function makeService(region = "uz"): MetricsService {
  const config = { get: (key: string) => (key === "DATA_REGION" ? region : undefined) } as unknown as ConfigService;
  return new MetricsService(config);
}

describe("MetricsService", () => {
  it("renders request counters per method/route/status", () => {
    const metrics = makeService();
    metrics.recordRequest("GET", "/health", 200, 3);
    metrics.recordRequest("GET", "/health", 200, 7);
    const out = metrics.render();
    expect(out).toContain('ovozai_http_requests_total{method="GET",route="/health",status="200"} 2');
  });

  it("renders a cumulative latency histogram and process + build gauges", () => {
    const metrics = makeService("uz");
    metrics.recordRequest("POST", "/billing/subscription", 201, 120);
    const out = metrics.render();
    // 120ms falls in the <=250 bucket but not <=100.
    expect(out).toContain('ovozai_http_request_duration_ms_bucket{le="100"} 0');
    expect(out).toContain('ovozai_http_request_duration_ms_bucket{le="250"} 1');
    expect(out).toContain('ovozai_http_request_duration_ms_bucket{le="+Inf"} 1');
    expect(out).toContain("ovozai_http_request_duration_ms_count 1");
    expect(out).toContain("process_uptime_seconds ");
    expect(out).toContain('ovozai_build_info{version="');
    expect(out).toContain('data_region="uz"} 1');
  });

  it("appends extra lines (e.g. queue gauges)", () => {
    const metrics = makeService();
    const out = metrics.render(['ovozai_queue_jobs{queue="webhook",state="waiting"} 4']);
    expect(out).toContain('ovozai_queue_jobs{queue="webhook",state="waiting"} 4');
  });
});
