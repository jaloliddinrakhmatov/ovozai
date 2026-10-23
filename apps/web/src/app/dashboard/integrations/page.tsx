"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  createIntegrationRequestSchema,
  integrationTypeSchema,
  roleSatisfies,
  type IntegrationDto,
  type IntegrationType,
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
import {
  createIntegration,
  deleteIntegration,
  getGoogleCalendarAuthUrl,
  listIntegrations,
} from "@/lib/integrations-api";
import { describeError, zodFieldErrors, type FieldErrors } from "@/lib/form";
import { formatDateTime } from "@/lib/datetime";
import { FormField } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import { IntegrationStatusBadge } from "@/components/integration-status-badge";

const INTEGRATION_TYPES: readonly IntegrationType[] = integrationTypeSchema.options;

function ConnectIntegrationForm({ onCreated }: { onCreated: () => void }) {
  const [type, setType] = useState<IntegrationType>("CALENDAR");
  const [provider, setProvider] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const parsed = createIntegrationRequestSchema.safeParse({
      type,
      provider,
      ...(apiKey ? { apiKey } : {}),
    });
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }

    setSubmitting(true);
    try {
      await createIntegration(parsed.data);
      setProvider("");
      setApiKey("");
      setType("CALENDAR");
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
        <CardTitle>Connect an integration</CardTitle>
        <CardDescription>
          Link an external provider to this organization. API keys are stored securely and never
          shown again.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form className="flex flex-col gap-4 sm:max-w-sm" onSubmit={onSubmit} noValidate>
          <SelectField
            label="Type"
            name="type"
            value={type}
            onChange={(e) => setType(integrationTypeSchema.parse(e.target.value))}
            error={fieldErrors.type}
          >
            {INTEGRATION_TYPES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </SelectField>
          <FormField
            label="Provider"
            name="provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            error={fieldErrors.provider}
            placeholder="google-calendar"
            required
          />
          <FormField
            label="API key (optional)"
            name="apiKey"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            error={fieldErrors.apiKey}
            placeholder="Paste a provider API key"
            autoComplete="off"
          />
          <div>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Connecting…" : "Connect"}
            </Button>
          </div>
        </form>

        {formError ? <Alert variant="destructive">{formError}</Alert> : null}
      </CardContent>
    </Card>
  );
}

function IntegrationRow({
  integration,
  onChanged,
  onError,
}: {
  integration: IntegrationDto;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  const onDisconnect = async () => {
    setBusy(true);
    try {
      await deleteIntegration(integration.id);
      onChanged();
    } catch (err) {
      onError(describeError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-4 py-3">
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{integration.provider}</span>
        <span className="text-xs text-muted-foreground">
          {integration.type} · updated {formatDateTime(integration.updatedAt)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <IntegrationStatusBadge status={integration.status} />
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void onDisconnect()}>
          {busy ? "Working…" : "Disconnect"}
        </Button>
      </div>
    </li>
  );
}

function GoogleCalendarCard({
  integrations,
  onChanged,
}: {
  integrations: IntegrationDto[];
  onChanged: () => void;
}) {
  const connected = integrations.find(
    (i) => i.type === "CALENDAR" && i.provider === "google" && i.status === "CONNECTED",
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const connect = async () => {
    setErr(null);
    setBusy(true);
    try {
      const { url } = await getGoogleCalendarAuthUrl();
      window.location.href = url;
    } catch (e) {
      setErr(describeError(e).message);
      setBusy(false);
    }
  };
  const disconnect = async () => {
    if (!connected) return;
    setBusy(true);
    try {
      await deleteIntegration(connected.id);
      onChanged();
    } catch (e) {
      setErr(describeError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/80">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect x="3" y="4.5" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
                <path d="M3 9.5h18M8 2.5v4M16 2.5v4M12 13.5v3M10.5 15h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <div>
              <p className="font-medium">Google Calendar</p>
              <p className="text-sm text-muted-foreground">
                {connected
                  ? "Connected — appointments the AI books appear in your Google Calendar."
                  : "Connect so appointments the AI books are added to your Google Calendar automatically."}
              </p>
            </div>
          </div>
          {connected ? (
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
                Connected
              </span>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void disconnect()}>
                {busy ? "Working…" : "Disconnect"}
              </Button>
            </div>
          ) : (
            <Button disabled={busy} onClick={() => void connect()}>
              {busy ? "Opening…" : "Connect Google Calendar"}
            </Button>
          )}
        </div>
        {err ? <Alert variant="destructive">{err}</Alert> : null}
      </CardContent>
    </Card>
  );
}

export default function IntegrationsPage() {
  const { activeRole } = useAuth();
  const canManage = activeRole ? roleSatisfies(activeRole, "ADMIN") : false;
  const [calBanner, setCalBanner] = useState<{ ok: boolean; reason?: string } | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const c = sp.get("calendar");
    if (c === "connected") setCalBanner({ ok: true });
    else if (c === "error") setCalBanner({ ok: false, reason: sp.get("reason") ?? undefined });
  }, []);

  const [integrations, setIntegrations] = useState<IntegrationDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (cursor?: string) => {
    setLoadError(null);
    try {
      const result = await listIntegrations(cursor ? { cursor } : undefined);
      setIntegrations((prev) => (cursor ? [...prev, ...result.data] : result.data));
      setNextCursor(result.pageInfo.hasNextPage ? result.pageInfo.nextCursor : null);
    } catch (err) {
      setLoadError(describeError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    void load();
  }, [canManage, load]);

  const reload = useCallback(() => {
    setLoading(true);
    void load();
  }, [load]);

  if (!canManage) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <Alert>You need the ADMIN role or higher to manage integrations.</Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect calendars, CRMs, payments, and telephony providers to this organization.
        </p>
      </div>

      {calBanner?.ok ? (
        <Alert variant="success">
          Google Calendar connected. New appointments the AI books will appear there.
        </Alert>
      ) : null}
      {calBanner && !calBanner.ok ? (
        <Alert variant="destructive">
          Couldn&apos;t connect Google Calendar{calBanner.reason ? ` (${calBanner.reason})` : ""}. Please try again.
        </Alert>
      ) : null}

      <GoogleCalendarCard integrations={integrations} onChanged={reload} />

      <ConnectIntegrationForm onCreated={reload} />

      <Card>
        <CardHeader>
          <CardTitle>Connected integrations</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {loadError ? <Alert variant="destructive">{loadError}</Alert> : null}
          {loading && integrations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading integrations…</p>
          ) : integrations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No integrations connected yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {integrations.map((integration) => (
                <IntegrationRow
                  key={integration.id}
                  integration={integration}
                  onChanged={reload}
                  onError={setLoadError}
                />
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
