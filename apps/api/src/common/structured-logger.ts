import type { LoggerService } from "@nestjs/common";
import { currentRequestId } from "./log-context";
import { redactPii, redactString } from "./redaction";

type Level = "log" | "error" | "warn" | "debug" | "verbose";

/**
 * JSON line logger for log aggregation (Phase 7, docs/COMPLIANCE.md §5). Every
 * line carries the per-request correlation id (when inside a request) and is
 * PII-redacted before it leaves the process. Selected via LOG_FORMAT=json; the
 * default pretty Nest logger is kept in development.
 */
export class StructuredLogger implements LoggerService {
  log(message: unknown, ...rest: unknown[]): void {
    this.write("log", message, rest);
  }
  error(message: unknown, ...rest: unknown[]): void {
    this.write("error", message, rest);
  }
  warn(message: unknown, ...rest: unknown[]): void {
    this.write("warn", message, rest);
  }
  debug(message: unknown, ...rest: unknown[]): void {
    this.write("debug", message, rest);
  }
  verbose(message: unknown, ...rest: unknown[]): void {
    this.write("verbose", message, rest);
  }

  private write(level: Level, message: unknown, rest: unknown[]): void {
    // Nest convention: the last string argument is the context (logger name).
    const last = rest[rest.length - 1];
    const context = typeof last === "string" ? last : undefined;
    const requestId = currentRequestId();
    const entry: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      ...(context ? { context } : {}),
      ...(requestId ? { requestId } : {}),
      msg: typeof message === "string" ? redactString(message) : redactPii(message),
    };
    const line = JSON.stringify(entry);
    if (level === "error" || level === "warn") process.stderr.write(line + "\n");
    else process.stdout.write(line + "\n");
  }
}
