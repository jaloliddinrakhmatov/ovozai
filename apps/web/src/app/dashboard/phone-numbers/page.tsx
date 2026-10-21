"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createPhoneNumberRequestSchema,
  phoneNumberStatusSchema,
  roleSatisfies,
  type AgentDto,
  type PhoneNumberDto,
  type PhoneNumberStatus,
} from "@ovozai/contracts";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ovozai/ui";
import { useAuth } from "@/lib/auth-context";
import { listAgents } from "@/lib/agents-api";
import {
  createPhoneNumber,
  listPhoneNumbers,
  releasePhoneNumber,
  updatePhoneNumber,
} from "@/lib/phone-numbers-api";
import { describeError, zodFieldErrors, type FieldErrors } from "@/lib/form";
import { FormField } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import { PhoneNumberStatusBadge } from "@/components/phone-number-status-badge";

const STATUSES: readonly PhoneNumberStatus[] = phoneNumberStatusSchema.options;

function CreatePhoneNumberForm({
  agents,
  onCreated,
}: {
  agents: AgentDto[];
  onCreated: () => void;
}) {
  const [e164, setE164] = useState("");
  const [provider, setProvider] = useState("mock");
  const [agentId, setAgentId] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const parsed = createPhoneNumberRequestSchema.safeParse({
      e164,
      provider: provider || "mock",
      ...(agentId ? { agentId } : {}),
    });
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }

    setSubmitting(true);
    try {
      await createPhoneNumber(parsed.data);
      setE164("");
      setProvider("mock");
      setAgentId("");
      onCreated();
    } catch (error) {
      const described = describeError(error);
      setFormError(described.message);
      setFieldErrors(described.fieldErrors);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a phone number</CardTitle>
        <CardDescription>
          Register a number and optionally route it to an agent. You can change routing and
          status later.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <FormField
                label="Phone number (E.164)"
                name="e164"
                value={e164}
                onChange={(e) => setE164(e.target.value)}
                error={fieldErrors.e164}
                placeholder="+998901234567"
                required
              />
            </div>
            <div className="flex-1">
              <FormField
                label="Provider"
                name="provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                error={fieldErrors.provider}
                placeholder="mock"
              />
            </div>
            <SelectField
              label="Routed agent"
              name="agentId"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              error={fieldErrors.agentId}
            >
              <option value="">Unrouted</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </SelectField>
          </div>
          <div>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Adding…" : "Add number"}
            </Button>
          </div>
        </form>
        {formError ? <Alert variant="destructive">{formError}</Alert> : null}
      </CardContent>
    </Card>
  );
}

function PhoneNumberRow({
  phoneNumber,
  agents,
  agentName,
  canManage,
  onChanged,
  onError,
}: {
  phoneNumber: PhoneNumberDto;
  agents: AgentDto[];
  agentName: string | null;
  canManage: boolean;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  const onRoute = async (value: string) => {
    setBusy(true);
    try {
      await updatePhoneNumber(phoneNumber.id, { agentId: value ? value : null });
      onChanged();
    } catch (err) {
      onError(describeError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const onStatus = async (value: PhoneNumberStatus) => {
    setBusy(true);
    try {
      await updatePhoneNumber(phoneNumber.id, { status: value });
      onChanged();
    } catch (err) {
      onError(describeError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const onRelease = async () => {
    setBusy(true);
    try {
      await releasePhoneNumber(phoneNumber.id);
      onChanged();
    } catch (err) {
      onError(describeError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-4 py-3">
      <div className="flex flex-col">
        <span className="font-mono font-medium">{phoneNumber.e164}</span>
        <span className="text-xs text-muted-foreground">
          {phoneNumber.provider} · {agentName ?? "Unrouted"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <PhoneNumberStatusBadge status={phoneNumber.status} />
        {canManage ? (
          <>
            <SelectField
              label="Route"
              name={`route-${phoneNumber.id}`}
              value={phoneNumber.agentId ?? ""}
              disabled={busy}
              onChange={(e) => void onRoute(e.target.value)}
            >
              <option value="">Unrouted</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Status"
              name={`status-${phoneNumber.id}`}
              value={phoneNumber.status}
              disabled={busy}
              onChange={(e) => void onStatus(phoneNumberStatusSchema.parse(e.target.value))}
            >
              {STATUSES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </SelectField>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void onRelease()}>
              {busy ? "Working…" : "Release"}
            </Button>
          </>
        ) : null}
      </div>
    </li>
  );
}

export default function PhoneNumbersPage() {
  const { activeRole } = useAuth();
  const canManage = activeRole ? roleSatisfies(activeRole, "ADMIN") : false;

  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumberDto[]>([]);
  const [agents, setAgents] = useState<AgentDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<PhoneNumberStatus | "">("");

  const load = useCallback(
    async (cursor?: string) => {
      setLoadError(null);
      try {
        const result = await listPhoneNumbers({
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(cursor ? { cursor } : {}),
        });
        setPhoneNumbers((prev) => (cursor ? [...prev, ...result.data] : result.data));
        setNextCursor(result.pageInfo.hasNextPage ? result.pageInfo.nextCursor : null);
      } catch (err) {
        setLoadError(describeError(err).message);
      } finally {
        setLoading(false);
      }
    },
    [statusFilter],
  );

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    // Agent names are shown for all roles; routing requires ADMIN.
    listAgents({ limit: 100 })
      .then((result) => setAgents(result.data))
      .catch(() => setAgents([]));
  }, []);

  const reload = useCallback(() => {
    setLoading(true);
    void load();
  }, [load]);

  const agentNameById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent.name])),
    [agents],
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Phone numbers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Numbers that route inbound calls to this organization&rsquo;s agents.
        </p>
      </div>

      {canManage ? <CreatePhoneNumberForm agents={agents} onCreated={reload} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Your numbers</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="sm:max-w-xs">
            <SelectField
              label="Status"
              name="statusFilter"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value ? phoneNumberStatusSchema.parse(e.target.value) : "")
              }
            >
              <option value="">All statuses</option>
              {STATUSES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </SelectField>
          </div>

          {loadError ? <Alert variant="destructive">{loadError}</Alert> : null}
          {loading && phoneNumbers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading phone numbers…</p>
          ) : phoneNumbers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No phone numbers yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {phoneNumbers.map((phoneNumber) => {
                const routedName = phoneNumber.agentId
                  ? (agentNameById.get(phoneNumber.agentId) ?? null)
                  : null;
                return (
                  <PhoneNumberRow
                    key={phoneNumber.id}
                    phoneNumber={phoneNumber}
                    agents={agents}
                    agentName={routedName}
                    canManage={canManage}
                    onChanged={reload}
                    onError={setLoadError}
                  />
                );
              })}
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
