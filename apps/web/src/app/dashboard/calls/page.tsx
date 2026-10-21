"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  callDirectionSchema,
  callStatusSchema,
  type CallDirection,
  type CallDto,
  type CallStatus,
} from "@ovozai/contracts";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@ovozai/ui";
import { listCalls, type ListCallsParams } from "@/lib/calls-api";
import { describeError } from "@/lib/form";
import { formatDateTime, formatDuration, localInputToIso } from "@/lib/datetime";
import { FormField } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import { CallStatusBadge } from "@/components/call-status-badge";

const STATUSES: readonly CallStatus[] = callStatusSchema.options;
const DIRECTIONS: readonly CallDirection[] = callDirectionSchema.options;

type CallFilters = Pick<ListCallsParams, "status" | "direction" | "from" | "to">;

function CallRow({ call }: { call: CallDto }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-4 py-3">
      <div className="flex flex-col">
        <Link
          href={`/dashboard/calls/${call.id}`}
          className="font-medium underline-offset-2 hover:underline"
        >
          {call.fromE164 ?? "Unknown"} → {call.toE164 ?? "Unknown"}
        </Link>
        <span className="text-xs text-muted-foreground">
          {call.direction} · {call.language} · {formatDateTime(call.startedAt)} ·{" "}
          {formatDuration(call.durationSec)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <CallStatusBadge status={call.status} />
        <Link
          href={`/dashboard/calls/${call.id}`}
          className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          View
        </Link>
      </div>
    </li>
  );
}

export default function CallsPage() {
  const [calls, setCalls] = useState<CallDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [statusDraft, setStatusDraft] = useState("");
  const [directionDraft, setDirectionDraft] = useState("");
  const [fromDraft, setFromDraft] = useState("");
  const [toDraft, setToDraft] = useState("");
  const [filters, setFilters] = useState<CallFilters>({});

  const load = useCallback(
    async (cursor?: string) => {
      setLoadError(null);
      try {
        const result = await listCalls({ ...filters, ...(cursor ? { cursor } : {}) });
        setCalls((prev) => (cursor ? [...prev, ...result.data] : result.data));
        setNextCursor(result.pageInfo.hasNextPage ? result.pageInfo.nextCursor : null);
      } catch (err) {
        setLoadError(describeError(err).message);
      } finally {
        setLoading(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const onApplyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fromIso = localInputToIso(fromDraft);
    const toIso = localInputToIso(toDraft);
    setFilters({
      ...(statusDraft ? { status: callStatusSchema.parse(statusDraft) } : {}),
      ...(directionDraft ? { direction: callDirectionSchema.parse(directionDraft) } : {}),
      ...(fromIso ? { from: fromIso } : {}),
      ...(toIso ? { to: toIso } : {}),
    });
  };

  const onClearFilters = () => {
    setStatusDraft("");
    setDirectionDraft("");
    setFromDraft("");
    setToDraft("");
    setFilters({});
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Calls</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Call history for this organization, newest first.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
            onSubmit={onApplyFilters}
          >
            <SelectField
              label="Status"
              name="status"
              value={statusDraft}
              onChange={(e) => setStatusDraft(e.target.value)}
            >
              <option value="">All statuses</option>
              {STATUSES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Direction"
              name="direction"
              value={directionDraft}
              onChange={(e) => setDirectionDraft(e.target.value)}
            >
              <option value="">All directions</option>
              {DIRECTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </SelectField>
            <FormField
              label="From"
              name="from"
              type="datetime-local"
              value={fromDraft}
              onChange={(e) => setFromDraft(e.target.value)}
            />
            <FormField
              label="To"
              name="to"
              type="datetime-local"
              value={toDraft}
              onChange={(e) => setToDraft(e.target.value)}
            />
            <div className="flex gap-2">
              <Button type="submit">Apply</Button>
              <Button type="button" variant="outline" onClick={onClearFilters}>
                Clear
              </Button>
            </div>
          </form>

          {loadError ? <Alert variant="destructive">{loadError}</Alert> : null}
          {loading && calls.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading calls…</p>
          ) : calls.length === 0 ? (
            <p className="text-sm text-muted-foreground">No calls found.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {calls.map((call) => (
                <CallRow key={call.id} call={call} />
              ))}
            </ul>
          )}
          {nextCursor ? (
            <div>
              <Button variant="outline" size="sm" onClick={() => void load(nextCursor)}>
                Load more
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
