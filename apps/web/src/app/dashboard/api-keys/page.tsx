"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  createApiKeyRequestSchema,
  roleSatisfies,
  type ApiKeyCreatedDto,
  type ApiKeyDto,
  type ApiKeyStatus,
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
  type BadgeVariant,
} from "@ovozai/ui";
import { useAuth } from "@/lib/auth-context";
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/auth-api";
import { describeError, zodFieldErrors, type FieldErrors } from "@/lib/form";
import { FormField } from "@/components/form-field";
import { CopyField } from "@/components/copy-field";

const STATUS_VARIANT: Record<ApiKeyStatus, BadgeVariant> = {
  ACTIVE: "success",
  REVOKED: "destructive",
  EXPIRED: "secondary",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function CreateApiKeyForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<ApiKeyCreatedDto | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setCreated(null);

    const scopeList = scopes
      .split(",")
      .map((scope) => scope.trim())
      .filter((scope) => scope.length > 0);

    const parsed = createApiKeyRequestSchema.safeParse({
      name,
      ...(scopeList.length > 0 ? { scopes: scopeList } : {}),
      ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
    });
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }

    setSubmitting(true);
    try {
      const key = await createApiKey(parsed.data);
      setCreated(key);
      setName("");
      setScopes("");
      setExpiresAt("");
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
        <CardTitle>Create an API key</CardTitle>
        <CardDescription>
          The full secret is shown once, immediately after creation. Store it somewhere safe.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <FormField
            label="Name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={fieldErrors.name}
            required
          />
          <FormField
            label="Scopes"
            name="scopes"
            value={scopes}
            onChange={(e) => setScopes(e.target.value)}
            error={fieldErrors.scopes}
            placeholder="Optional — comma separated, e.g. calls:read, calls:write"
          />
          <FormField
            label="Expires at"
            name="expiresAt"
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            error={fieldErrors.expiresAt}
          />
          <div>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create key"}
            </Button>
          </div>
        </form>

        {formError ? <Alert variant="destructive">{formError}</Alert> : null}

        {created ? (
          <Alert variant="success" className="flex flex-col gap-2">
            <span className="font-medium">Key “{created.name}” created.</span>
            <span className="text-xs">
              This is the only time the full key will be shown. You won’t be able to see it
              again after leaving this page.
            </span>
            <CopyField label="API key" value={created.key} />
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function ApiKeysPage() {
  const { activeRole } = useAuth();
  const canManage = activeRole ? roleSatisfies(activeRole, "ADMIN") : false;

  const [keys, setKeys] = useState<ApiKeyDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const result = await listApiKeys();
      setKeys(result.data);
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

  const onRevoke = async (id: string) => {
    setRevokingId(id);
    try {
      await revokeApiKey(id);
      await load();
    } catch (err) {
      setLoadError(describeError(err).message);
    } finally {
      setRevokingId(null);
    }
  };

  if (!canManage) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">API keys</h1>
        <Alert>You need the ADMIN role or higher to manage API keys.</Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">API keys</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Programmatic access to this organization.
        </p>
      </div>

      <CreateApiKeyForm onCreated={load} />

      <Card>
        <CardHeader>
          <CardTitle>Active &amp; past keys</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {loadError ? <Alert variant="destructive">{loadError}</Alert> : null}
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading keys…</p>
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No API keys yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {keys.map((key) => (
                <li
                  key={key.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-4 py-3"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{key.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {key.prefix}…
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Created {formatDate(key.createdAt)} · Expires {formatDate(key.expiresAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[key.status]}>{key.status}</Badge>
                    {key.status === "ACTIVE" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={revokingId === key.id}
                        onClick={() => void onRevoke(key.id)}
                      >
                        {revokingId === key.id ? "Revoking…" : "Revoke"}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
