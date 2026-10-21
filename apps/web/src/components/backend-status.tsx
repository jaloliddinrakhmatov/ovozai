"use client";

import { useEffect, useState } from "react";
import type { LivenessResponse } from "@ovozai/contracts";
import { cn } from "@ovozai/ui";
import { fetchLiveness, getApiBaseUrl } from "@/lib/api";

/** Poll interval for the liveness probe, in milliseconds. */
const POLL_INTERVAL_MS = 5_000;

type ConnectionState = "checking" | "online" | "offline";

const DOT_CLASSES: Record<ConnectionState, string> = {
  checking: "bg-amber-500",
  online: "bg-emerald-500",
  offline: "bg-red-500",
};

export function BackendStatus() {
  const [state, setState] = useState<ConnectionState>("checking");
  const [liveness, setLiveness] = useState<LivenessResponse | null>(null);
  // Resolved once on the client so SSR and first paint agree on the value.
  const [apiUrl, setApiUrl] = useState<string>("");

  useEffect(() => {
    setApiUrl(getApiBaseUrl());

    let cancelled = false;
    let controller: AbortController | null = null;

    const check = async () => {
      // Abort any still-pending request before starting a new one.
      controller?.abort();
      controller = new AbortController();

      try {
        const result = await fetchLiveness(controller.signal);
        if (cancelled) return;
        setLiveness(result);
        setState("online");
      } catch {
        if (cancelled || controller.signal.aborted) return;
        setLiveness(null);
        setState("offline");
      }
    };

    void check();
    const intervalId = setInterval(() => {
      void check();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      controller?.abort();
      clearInterval(intervalId);
    };
  }, []);

  const label =
    state === "online"
      ? `API connected — v${liveness?.version ?? "?"}`
      : state === "offline"
        ? "API offline"
        : "Checking API…";

  return (
    <div
      role="status"
      aria-live="polite"
      className="inline-flex flex-col gap-1 rounded-lg border border-border bg-accent/40 px-3 py-2 text-sm"
    >
      <span className="inline-flex items-center gap-2 font-medium">
        <span
          aria-hidden="true"
          className={cn(
            "size-2.5 shrink-0 rounded-full",
            DOT_CLASSES[state],
            state === "checking" && "animate-pulse",
          )}
        />
        <span>{label}</span>
        {state === "online" && liveness ? (
          <span className="text-muted-foreground">
            · up {Math.round(liveness.uptimeSec)}s
          </span>
        ) : null}
      </span>
      <span className="pl-[1.125rem] text-xs text-muted-foreground">
        {apiUrl || "resolving API URL…"}
      </span>
    </div>
  );
}
