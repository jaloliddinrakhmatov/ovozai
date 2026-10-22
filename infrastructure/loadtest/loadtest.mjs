#!/usr/bin/env node
// OvozAI — dependency-free HTTP load harness (Phase 7, docs/COMPLIANCE.md §6).
//
// Drives a target endpoint at a fixed concurrency for a duration and reports
// throughput + latency percentiles. Uses only Node built-ins (global fetch).
//
// Usage:
//   node infrastructure/loadtest/loadtest.mjs \
//     --url http://localhost:3001/api/v1/health \
//     --concurrency 50 --duration 20 [--method GET] [--header "k: v"] [--body '{"..."}']
//
// Exit code is non-zero if any request errors (connection/timeout), so it can gate
// a smoke in CI.

function parseArgs(argv) {
  const args = { url: null, concurrency: 20, duration: 10, method: "GET", headers: {}, body: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[(i += 1)];
    if (a === "--url") args.url = next();
    else if (a === "--concurrency" || a === "-c") args.concurrency = Number(next());
    else if (a === "--duration" || a === "-d") args.duration = Number(next());
    else if (a === "--method" || a === "-m") args.method = next();
    else if (a === "--body") args.body = next();
    else if (a === "--header" || a === "-H") {
      const raw = next();
      const idx = raw.indexOf(":");
      if (idx > 0) args.headers[raw.slice(0, idx).trim()] = raw.slice(idx + 1).trim();
    }
  }
  if (!args.url) {
    console.error("error: --url is required");
    process.exit(2);
  }
  return args;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const deadline = Date.now() + args.duration * 1000;
  const latencies = [];
  const statusCounts = new Map();
  let errors = 0;
  let total = 0;

  const headers = { ...args.headers };
  if (args.body && !Object.keys(headers).some((h) => h.toLowerCase() === "content-type")) {
    headers["content-type"] = "application/json";
  }

  async function worker() {
    while (Date.now() < deadline) {
      const start = performance.now();
      try {
        const res = await fetch(args.url, { method: args.method, headers, body: args.body ?? undefined });
        await res.arrayBuffer(); // drain
        latencies.push(performance.now() - start);
        statusCounts.set(res.status, (statusCounts.get(res.status) ?? 0) + 1);
      } catch {
        errors += 1;
      }
      total += 1;
    }
  }

  const startedAt = Date.now();
  await Promise.all(Array.from({ length: args.concurrency }, () => worker()));
  const elapsedSec = (Date.now() - startedAt) / 1000;

  latencies.sort((a, b) => a - b);
  const sum = latencies.reduce((s, v) => s + v, 0);
  const fmt = (n) => `${n.toFixed(1)}ms`;

  console.log("────────────────────────────────────────────");
  console.log(` OvozAI load test`);
  console.log(` target      : ${args.method} ${args.url}`);
  console.log(` concurrency : ${args.concurrency}   duration: ${args.duration}s`);
  console.log("────────────────────────────────────────────");
  console.log(` requests    : ${total}   (${errors} errors)`);
  console.log(` throughput  : ${(latencies.length / elapsedSec).toFixed(1)} req/s`);
  console.log(` latency p50 : ${fmt(percentile(latencies, 50))}`);
  console.log(` latency p90 : ${fmt(percentile(latencies, 90))}`);
  console.log(` latency p95 : ${fmt(percentile(latencies, 95))}`);
  console.log(` latency p99 : ${fmt(percentile(latencies, 99))}`);
  console.log(` latency avg : ${fmt(latencies.length ? sum / latencies.length : 0)}`);
  console.log(` status      : ${[...statusCounts.entries()].map(([s, c]) => `${s}=${c}`).join(" ") || "(none)"}`);
  console.log("────────────────────────────────────────────");

  process.exit(errors > 0 ? 1 : 0);
}

void main();
