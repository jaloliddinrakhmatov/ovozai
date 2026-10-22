"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  erasureRequestSchema,
  roleSatisfies,
  updateRetentionPolicyRequestSchema,
  type ErasureResult,
  type RetentionPolicy,
  type RlsStatus,
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
  eraseCustomer,
  getRetentionPolicy,
  getRlsStatus,
  runRetentionSweep,
  updateRetentionPolicy,
} from "@/lib/compliance-api";
import { describeError } from "@/lib/form";
import { FormField } from "@/components/form-field";

const integerFormatter = new Intl.NumberFormat("en-US");

function formatDays(value: number | null): string {
  if (value === null) return "Retained indefinitely";
  return `${integerFormatter.format(value)} day${value === 1 ? "" : "s"}`;
}

function RlsStatusCard({ status, loading }: { status: RlsStatus | null; loading: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Row-level security</CardTitle>
        <CardDescription>
          Defense-in-depth tenant isolation, checked live through the enforced database connection.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {loading && !status ? (
          <p className="text-sm text-muted-foreground">Checking isolation…</p>
        ) : !status ? (
          <p className="text-sm text-muted-foreground">RLS status is unavailable right now.</p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Database enforcement</span>
              {status.rlsEnforced ? (
                <Badge variant="success">Enforced</Badge>
              ) : (
                <Badge variant="secondary">App-layer only</Badge>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1 rounded-md border border-border px-4 py-3">
                <span className="text-xs text-muted-foreground">Your org&rsquo;s customers</span>
                <span className="text-xl font-semibold tabular-nums">
                  {integerFormatter.format(status.selfOrgVisibleCustomers)}
                </span>
              </div>
              <div className="flex flex-col gap-1 rounded-md border border-border px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    Other orgs&rsquo; customers visible
                  </span>
                  {status.foreignOrgVisibleCustomers === 0 ? (
                    <Badge variant="success">Isolated</Badge>
                  ) : (
                    <Badge variant="destructive">Leak</Badge>
                  )}
                </div>
                <span className="text-xl font-semibold tabular-nums">
                  {integerFormatter.format(status.foreignOrgVisibleCustomers)}
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              A foreign-org count of 0 proves isolation is enforced at the database level, not just
              by the application. When enforcement shows &ldquo;App-layer only&rdquo; the owner
              connection is bypassing RLS and the app-layer tenant guard is the primary control.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RetentionForm({
  policy,
  canEdit,
  onSaved,
}: {
  policy: RetentionPolicy;
  canEdit: boolean;
  onSaved: (updated: RetentionPolicy) => void;
}) {
  const [recording, setRecording] = useState(() => policy.recordingRetentionDays?.toString() ?? "");
  const [transcript, setTranscript] = useState(
    () => policy.transcriptRetentionDays?.toString() ?? "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setSuccess(null);

    // Empty input means "retain indefinitely" (null); anything else is a day count.
    const parsed = updateRetentionPolicyRequestSchema.safeParse({
      recordingRetentionDays: recording.trim() === "" ? null : Number(recording),
      transcriptRetentionDays: transcript.trim() === "" ? null : Number(transcript),
    });
    if (!parsed.success) {
      setFormError("Enter a whole number of days (1–3650), or leave blank to retain indefinitely.");
      return;
    }

    setSubmitting(true);
    try {
      const updated = await updateRetentionPolicy(parsed.data);
      setRecording(updated.recordingRetentionDays?.toString() ?? "");
      setTranscript(updated.transcriptRetentionDays?.toString() ?? "");
      setSuccess("Retention policy saved.");
      onSaved(updated);
    } catch (err) {
      setFormError(describeError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="flex flex-col gap-4 sm:max-w-sm" onSubmit={onSubmit} noValidate>
      <FormField
        label="Recording retention (days)"
        name="recordingRetentionDays"
        type="number"
        min={1}
        max={3650}
        value={recording}
        onChange={(e) => setRecording(e.target.value)}
        placeholder="Retain indefinitely"
        disabled={!canEdit}
      />
      <FormField
        label="Transcript retention (days)"
        name="transcriptRetentionDays"
        type="number"
        min={1}
        max={3650}
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        placeholder="Retain indefinitely"
        disabled={!canEdit}
      />
      {canEdit ? (
        <div>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save policy"}
          </Button>
        </div>
      ) : null}

      {formError ? <Alert variant="destructive">{formError}</Alert> : null}
      {success ? <Alert variant="success">{success}</Alert> : null}
    </form>
  );
}

function RetentionCard({
  policy,
  loading,
  canEdit,
  onSaved,
}: {
  policy: RetentionPolicy | null;
  loading: boolean;
  canEdit: boolean;
  onSaved: (updated: RetentionPolicy) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Data retention</CardTitle>
        <CardDescription>
          How long call recordings and transcripts are kept before the retention sweep purges them.
          Leave a field empty to retain indefinitely. Changing the policy requires the OWNER role.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {loading && !policy ? (
          <p className="text-sm text-muted-foreground">Loading retention policy…</p>
        ) : !policy ? (
          <p className="text-sm text-muted-foreground">Retention policy is unavailable.</p>
        ) : (
          <>
            <RetentionForm policy={policy} canEdit={canEdit} onSaved={onSaved} />
            {!canEdit ? (
              <p className="text-xs text-muted-foreground">
                You can view the current policy, but updating it requires the OWNER role.
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ErasureCard({ canErase }: { canErase: boolean }) {
  const [customerId, setCustomerId] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<ErasureResult | null>(null);

  const reset = () => {
    setConfirming(false);
    setFormError(null);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setResult(null);

    const parsed = erasureRequestSchema.safeParse({
      customerId: customerId.trim(),
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    });
    if (!parsed.success) {
      setFormError("Enter a valid customer ID (UUID).");
      setConfirming(false);
      return;
    }

    // Destructive and irreversible: require an explicit second click to confirm.
    if (!confirming) {
      setConfirming(true);
      return;
    }

    setSubmitting(true);
    try {
      const erased = await eraseCustomer(parsed.data);
      setResult(erased);
      setCustomerId("");
      setReason("");
      setConfirming(false);
    } catch (err) {
      setFormError(describeError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Right to erasure</CardTitle>
        <CardDescription>
          Permanently anonymize a customer and purge their recordings and transcripts in response
          to a data-subject request. This cannot be undone and requires the OWNER role.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form className="flex flex-col gap-4 sm:max-w-sm" onSubmit={onSubmit} noValidate>
          <FormField
            label="Customer ID"
            name="customerId"
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value);
              reset();
            }}
            placeholder="00000000-0000-0000-0000-000000000000"
            autoComplete="off"
            disabled={!canErase}
          />
          <FormField
            label="Reason (optional)"
            name="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Data-subject erasure request"
            disabled={!canErase}
          />
          {canErase ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" variant="outline" disabled={submitting}>
                {submitting
                  ? "Erasing…"
                  : confirming
                    ? "Confirm erasure — this cannot be undone"
                    : "Erase customer data"}
              </Button>
              {confirming && !submitting ? (
                <Button type="button" variant="ghost" onClick={reset}>
                  Cancel
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Erasing customer data requires the OWNER role.
            </p>
          )}
        </form>

        {formError ? <Alert variant="destructive">{formError}</Alert> : null}
        {result ? (
          <Alert variant="success">
            <p className="font-medium">Erasure complete for customer {result.customerId}.</p>
            <ul className="mt-2 flex flex-col gap-0.5 text-xs">
              <li>Customer anonymized: {result.anonymizedCustomer ? "yes" : "no"}</li>
              <li>Calls redacted: {integerFormatter.format(result.redactedCalls)}</li>
              <li>Transcripts deleted: {integerFormatter.format(result.deletedTranscripts)}</li>
              <li>
                Transcript turns deleted: {integerFormatter.format(result.deletedTranscriptTurns)}
              </li>
              <li>Recordings deleted: {integerFormatter.format(result.deletedRecordings)}</li>
            </ul>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RetentionSweepCard({ policy, canRun }: { policy: RetentionPolicy | null; canRun: boolean }) {
  const [submitting, setSubmitting] = useState(false);
  const [queued, setQueued] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const onRun = async () => {
    setFormError(null);
    setQueued(false);
    setSubmitting(true);
    try {
      await runRetentionSweep();
      setQueued(true);
    } catch (err) {
      setFormError(describeError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Retention sweep</CardTitle>
        <CardDescription>
          Enqueue an immediate purge of data older than the retention policy. The sweep runs in the
          background and requires the OWNER role.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {policy ? (
          <p className="text-sm text-muted-foreground">
            Recordings: {formatDays(policy.recordingRetentionDays)} · Transcripts:{" "}
            {formatDays(policy.transcriptRetentionDays)}
          </p>
        ) : null}
        {canRun ? (
          <div>
            <Button variant="outline" disabled={submitting} onClick={() => void onRun()}>
              {submitting ? "Queuing…" : "Run retention sweep"}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Running a retention sweep requires the OWNER role.
          </p>
        )}

        {formError ? <Alert variant="destructive">{formError}</Alert> : null}
        {queued ? (
          <Alert variant="success">
            Retention sweep queued. Data past its retention window will be purged shortly.
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function CompliancePage() {
  const { activeRole } = useAuth();
  const isAdmin = activeRole ? roleSatisfies(activeRole, "ADMIN") : false;
  const isOwner = activeRole ? roleSatisfies(activeRole, "OWNER") : false;

  const [rlsStatus, setRlsStatus] = useState<RlsStatus | null>(null);
  const [retention, setRetention] = useState<RetentionPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [rls, policy] = await Promise.all([getRlsStatus(), getRetentionPolicy()]);
      setRlsStatus(rls);
      setRetention(policy);
    } catch (err) {
      setLoadError(describeError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    void load();
  }, [isAdmin, load]);

  if (!isAdmin) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Compliance</h1>
        <Alert>You need the ADMIN role or higher to view compliance settings.</Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Compliance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Data-protection controls for this organization: tenant isolation, retention, and the
          right to erasure under Law No. ZRU-547.
        </p>
      </div>

      {loadError ? <Alert variant="destructive">{loadError}</Alert> : null}

      <RlsStatusCard status={rlsStatus} loading={loading} />
      <RetentionCard
        policy={retention}
        loading={loading}
        canEdit={isOwner}
        onSaved={setRetention}
      />
      <ErasureCard canErase={isOwner} />
      <RetentionSweepCard policy={retention} canRun={isOwner} />
    </div>
  );
}
