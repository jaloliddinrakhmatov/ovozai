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

export default function IntegrationsPage() {
  const { activeRole } = useAuth();
  const canManage = activeRole ? roleSatisfies(activeRole, "ADMIN") : false;

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
