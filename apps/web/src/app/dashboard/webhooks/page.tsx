"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  WEBHOOK_EVENT_TYPES,
  createWebhookEndpointRequestSchema,
  roleSatisfies,
  webhookDeliveryStatusSchema,
  type WebhookDeliveryDto,
  type WebhookDeliveryStatus,
  type WebhookEndpointCreatedDto,
  type WebhookEndpointDto,
  type WebhookEventType,
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
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  listWebhookDeliveries,
  listWebhookEndpoints,
  updateWebhookEndpoint,
} from "@/lib/webhooks-api";
import { describeError, zodFieldErrors, type FieldErrors } from "@/lib/form";
import { formatDateTime } from "@/lib/datetime";
import { FormField } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import { CopyField } from "@/components/copy-field";
import { WebhookStatusBadge } from "@/components/webhook-status-badge";
import { WebhookDeliveryStatusBadge } from "@/components/webhook-delivery-status-badge";

const DELIVERY_STATUSES: readonly WebhookDeliveryStatus[] = webhookDeliveryStatusSchema.options;

function CreateWebhookForm({ onCreated }: { onCreated: () => void }) {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEventType[]>([]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<WebhookEndpointCreatedDto | null>(null);

  const toggleEvent = (event: WebhookEventType, checked: boolean) => {
    setEvents((prev) =>
      checked ? [...prev, event] : prev.filter((candidate) => candidate !== event),
    );
  };

  const onSubmit = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setCreated(null);

    const parsed = createWebhookEndpointRequestSchema.safeParse({ url, events });
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }

    setSubmitting(true);
    try {
      const endpoint = await createWebhookEndpoint(parsed.data);
      setCreated(endpoint);
      setUrl("");
      setEvents([]);
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
        <CardTitle>Add a webhook endpoint</CardTitle>
        <CardDescription>
          We POST signed event payloads to this URL. The signing secret is shown once,
          immediately after creation.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <FormField
            label="Endpoint URL"
            name="url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            error={fieldErrors.url}
            placeholder="https://example.com/webhooks/ovozai"
            required
          />
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Events</legend>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-4">
              {WEBHOOK_EVENT_TYPES.map((event) => (
                <label key={event} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="events"
                    value={event}
                    checked={events.includes(event)}
                    onChange={(e) => toggleEvent(event, e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  <span className="font-mono">{event}</span>
                </label>
              ))}
            </div>
            {fieldErrors.events ? (
              <p className="text-xs text-red-600 dark:text-red-400">{fieldErrors.events}</p>
            ) : null}
          </fieldset>
          <div>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Adding…" : "Add endpoint"}
            </Button>
          </div>
        </form>

        {formError ? <Alert variant="destructive">{formError}</Alert> : null}

        {created ? (
          <Alert variant="success" className="flex flex-col gap-2">
            <span className="font-medium">Endpoint created.</span>
            <span className="text-xs">
              This is the only time the signing secret will be shown. You won&rsquo;t be able to
              see it again after leaving this page.
            </span>
            <CopyField label="Signing secret" value={created.secret} />
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

function WebhookEndpointRow({
  endpoint,
  onChanged,
  onError,
}: {
  endpoint: WebhookEndpointDto;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const enabled = endpoint.status === "ACTIVE";

  const onToggle = async () => {
    setBusy(true);
    try {
      await updateWebhookEndpoint(endpoint.id, { status: enabled ? "DISABLED" : "ACTIVE" });
      onChanged();
    } catch (err) {
      onError(describeError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    setBusy(true);
    try {
      await deleteWebhookEndpoint(endpoint.id);
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
        <span className="truncate font-mono text-sm font-medium">{endpoint.url}</span>
        <span className="text-xs text-muted-foreground">
          {endpoint.events.length > 0 ? endpoint.events.join(", ") : "No events"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <WebhookStatusBadge status={endpoint.status} />
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void onToggle()}>
          {busy ? "Working…" : enabled ? "Disable" : "Enable"}
        </Button>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void onDelete()}>
          Delete
        </Button>
      </div>
    </li>
  );
}

function DeliveryRow({ delivery }: { delivery: WebhookDeliveryDto }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-4 py-3">
      <div className="flex flex-col">
        <span className="font-mono text-sm font-medium">{delivery.event}</span>
        <span className="text-xs text-muted-foreground">
          {delivery.attempts} attempt{delivery.attempts === 1 ? "" : "s"} ·{" "}
          {delivery.responseStatus !== null ? `HTTP ${delivery.responseStatus}` : "no response"} ·{" "}
          {formatDateTime(delivery.lastAttemptAt ?? delivery.createdAt)}
        </span>
      </div>
      <WebhookDeliveryStatusBadge status={delivery.status} />
    </li>
  );
}

function DeliveriesSection() {
  const [deliveries, setDeliveries] = useState<WebhookDeliveryDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<WebhookDeliveryStatus | "">("");

  const load = useCallback(
    async (cursor?: string) => {
      setLoadError(null);
      try {
        const result = await listWebhookDeliveries({
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(cursor ? { cursor } : {}),
        });
        setDeliveries((prev) => (cursor ? [...prev, ...result.data] : result.data));
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent deliveries</CardTitle>
        <CardDescription>Delivery attempts across all endpoints, newest first.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="sm:max-w-xs">
          <SelectField
            label="Status"
            name="deliveryStatusFilter"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value ? webhookDeliveryStatusSchema.parse(e.target.value) : "",
              )
            }
          >
            <option value="">All statuses</option>
            {DELIVERY_STATUSES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </SelectField>
        </div>

        {loadError ? <Alert variant="destructive">{loadError}</Alert> : null}
        {loading && deliveries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading deliveries…</p>
        ) : deliveries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No deliveries yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {deliveries.map((delivery) => (
              <DeliveryRow key={delivery.id} delivery={delivery} />
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
  );
}

export default function WebhooksPage() {
  const { activeRole } = useAuth();
  const canManage = activeRole ? roleSatisfies(activeRole, "ADMIN") : false;

  const [endpoints, setEndpoints] = useState<WebhookEndpointDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (cursor?: string) => {
    setLoadError(null);
    try {
      const result = await listWebhookEndpoints(cursor ? { cursor } : undefined);
      setEndpoints((prev) => (cursor ? [...prev, ...result.data] : result.data));
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
        <h1 className="text-2xl font-semibold tracking-tight">Webhooks</h1>
        <Alert>You need the ADMIN role or higher to manage webhooks.</Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Webhooks</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Receive signed event notifications for this organization.
        </p>
      </div>

      <CreateWebhookForm onCreated={reload} />

      <Card>
        <CardHeader>
          <CardTitle>Endpoints</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {loadError ? <Alert variant="destructive">{loadError}</Alert> : null}
          {loading && endpoints.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading endpoints…</p>
          ) : endpoints.length === 0 ? (
            <p className="text-sm text-muted-foreground">No webhook endpoints yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {endpoints.map((endpoint) => (
                <WebhookEndpointRow
                  key={endpoint.id}
                  endpoint={endpoint}
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

      <DeliveriesSection />
    </div>
  );
}
