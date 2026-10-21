"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  roleSatisfies,
  type CallDto,
  type CallEventDto,
  type RecordingUrlResponse,
  type TranscriptDto,
  type TranscriptRole,
} from "@ovozai/contracts";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ovozai/ui";
import { useAuth } from "@/lib/auth-context";
import {
  getCall,
  getCallRecording,
  getCallTranscript,
  listCallEvents,
} from "@/lib/calls-api";
import { describeError } from "@/lib/form";
import { formatDateTime, formatDuration } from "@/lib/datetime";
import { CallStatusBadge } from "@/components/call-status-badge";

const ROLE_LABEL: Record<TranscriptRole, string> = {
  CALLER: "Caller",
  AGENT: "Agent",
  SYSTEM: "System",
  TOOL: "Tool",
};

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function formatCost(costCents: number | null): string {
  if (costCents === null) return "—";
  return `$${(costCents / 100).toFixed(2)}`;
}

function CallMetadata({ call }: { call: CallDto }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <MetaRow label="Status">
            <CallStatusBadge status={call.status} />
          </MetaRow>
          <MetaRow label="Direction">{call.direction}</MetaRow>
          <MetaRow label="Language">{call.language}</MetaRow>
          <MetaRow label="From">{call.fromE164 ?? "—"}</MetaRow>
          <MetaRow label="To">{call.toE164 ?? "—"}</MetaRow>
          <MetaRow label="Duration">{formatDuration(call.durationSec)}</MetaRow>
          <MetaRow label="Started">{formatDateTime(call.startedAt)}</MetaRow>
          <MetaRow label="Answered">{formatDateTime(call.answeredAt)}</MetaRow>
          <MetaRow label="Ended">{formatDateTime(call.endedAt)}</MetaRow>
          <MetaRow label="Ended reason">{call.endedReason ?? "—"}</MetaRow>
          <MetaRow label="Cost">{formatCost(call.costCents)}</MetaRow>
          <MetaRow label="Agent">
            {call.agentId ? (
              <Link
                href={`/dashboard/agents/${call.agentId}`}
                className="underline underline-offset-2"
              >
                View agent
              </Link>
            ) : (
              "—"
            )}
          </MetaRow>
          <MetaRow label="Customer">
            {call.customerId ? (
              <Link
                href={`/dashboard/customers/${call.customerId}`}
                className="underline underline-offset-2"
              >
                View customer
              </Link>
            ) : (
              "—"
            )}
          </MetaRow>
          <MetaRow label="External ref">{call.externalRef ?? "—"}</MetaRow>
        </dl>
      </CardContent>
    </Card>
  );
}

function TranscriptPanel({ callId }: { callId: string }) {
  const [transcript, setTranscript] = useState<TranscriptDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await getCallTranscript(callId);
        if (!cancelled) setTranscript(result);
      } catch (err) {
        if (!cancelled) setError(describeError(err).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [callId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transcript</CardTitle>
        <CardDescription>What was said on the call, in order.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error ? <Alert variant="destructive">{error}</Alert> : null}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading transcript…</p>
        ) : transcript === null ? (
          <p className="text-sm text-muted-foreground">No transcript available for this call.</p>
        ) : transcript.turns.length === 0 ? (
          <p className="text-sm text-muted-foreground">The transcript has no turns yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {transcript.turns.map((turn) => (
              <li
                key={turn.id}
                className="flex flex-col gap-1 rounded-md border border-border px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{ROLE_LABEL[turn.role]}</Badge>
                  <span className="text-xs text-muted-foreground">{formatDuration(turn.startMs / 1000)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm">{turn.text}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function EventsPanel({ callId }: { callId: string }) {
  const [events, setEvents] = useState<CallEventDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (cursor?: string) => {
      setError(null);
      try {
        const result = await listCallEvents(callId, cursor ? { cursor } : undefined);
        setEvents((prev) => (cursor ? [...prev, ...result.data] : result.data));
        setNextCursor(result.pageInfo.hasNextPage ? result.pageInfo.nextCursor : null);
      } catch (err) {
        setError(describeError(err).message);
      } finally {
        setLoading(false);
      }
    },
    [callId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lifecycle events</CardTitle>
        <CardDescription>Every state change recorded for this call, in order.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error ? <Alert variant="destructive">{error}</Alert> : null}
        {loading && events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading events…</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events recorded.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-4 py-3"
              >
                <span className="text-sm font-medium">{event.type}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(event.occurredAt)}
                </span>
              </li>
            ))}
          </ol>
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
  );
}

function RecordingPanel({ callId, canAccess }: { callId: string; canAccess: boolean }) {
  const [recording, setRecording] = useState<RecordingUrlResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onLoad = async () => {
    setError(null);
    setLoading(true);
    try {
      setRecording(await getCallRecording(callId));
    } catch (err) {
      setError(describeError(err).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recording</CardTitle>
        <CardDescription>Call audio is available to administrators.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!canAccess ? (
          <p className="text-sm text-muted-foreground">
            You need the ADMIN role or higher to access recordings.
          </p>
        ) : (
          <>
            {error ? <Alert variant="destructive">{error}</Alert> : null}
            {recording === null ? (
              <div>
                <Button variant="outline" size="sm" disabled={loading} onClick={() => void onLoad()}>
                  {loading ? "Loading…" : "Load recording"}
                </Button>
              </div>
            ) : recording.url === null ? (
              <p className="text-sm text-muted-foreground">Recording not available.</p>
            ) : (
              <a
                href={recording.url}
                target="_blank"
                rel="noreferrer"
                className="text-sm underline underline-offset-2"
              >
                Open recording
                {recording.expiresAt
                  ? ` (expires ${formatDateTime(recording.expiresAt)})`
                  : ""}
              </a>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function CallDetailPage() {
  const params = useParams<{ id: string }>();
  const callId = params.id;
  const { activeRole } = useAuth();
  const canAccessRecording = activeRole ? roleSatisfies(activeRole, "ADMIN") : false;

  const [call, setCall] = useState<CallDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await getCall(callId);
        if (!cancelled) setCall(result);
      } catch (err) {
        if (!cancelled) setLoadError(describeError(err).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [callId]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/dashboard/calls" className="text-sm text-muted-foreground underline">
          ← Back to calls
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {call ? `${call.fromE164 ?? "Unknown"} → ${call.toE164 ?? "Unknown"}` : "Call"}
          </h1>
          {call ? <CallStatusBadge status={call.status} /> : null}
        </div>
      </div>

      {loadError ? <Alert variant="destructive">{loadError}</Alert> : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading call…</p> : null}

      {call ? (
        <>
          <CallMetadata call={call} />
          <TranscriptPanel callId={callId} />
          <EventsPanel callId={callId} />
          <RecordingPanel callId={callId} canAccess={canAccessRecording} />
        </>
      ) : null}
    </div>
  );
}
