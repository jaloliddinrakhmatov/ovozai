"use client";

import { useEffect, useState } from "react";
import type { WerSummaryItem } from "@ovozai/contracts";
import { Alert, Card, CardContent, CardHeader, CardTitle } from "@ovozai/ui";
import { getWerSummary } from "@/lib/wer-api";
import { describeError } from "@/lib/form";

/** Format a WER fraction (e.g. `0.1234`) as a percentage string (`12.3%`). */
function formatWer(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

export default function WerPage() {
  const [items, setItems] = useState<WerSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getWerSummary()
      .then((summary) => {
        if (!cancelled) setItems(summary.items);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(describeError(err).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Word Error Rate</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Average speech-to-text accuracy by provider and language. Lower is better.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {loadError ? <Alert variant="destructive">{loadError}</Alert> : null}
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading WER summary…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No WER samples recorded yet. Measurements appear here as calls are transcribed.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Provider</th>
                    <th className="px-3 py-2 font-medium">Language</th>
                    <th className="px-3 py-2 text-right font-medium">Samples</th>
                    <th className="px-3 py-2 text-right font-medium">Average WER</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={`${item.provider}-${item.language}`}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-3 py-2 font-medium">{item.provider}</td>
                      <td className="px-3 py-2">{item.language}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{item.sampleCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatWer(item.averageWer)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
