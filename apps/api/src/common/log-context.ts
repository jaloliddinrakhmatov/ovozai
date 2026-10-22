import { AsyncLocalStorage } from "node:async_hooks";

/** Per-request logging context, carried across async boundaries for correlation. */
interface LogContext {
  requestId: string;
}

const storage = new AsyncLocalStorage<LogContext>();

/** Run `fn` with a bound request id so every log line in the request can carry it. */
export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return storage.run({ requestId }, fn);
}

/** The current request's correlation id, if inside a request scope. */
export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
