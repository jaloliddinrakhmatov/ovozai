"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  agentStatusSchema,
  languageSchema,
  roleSatisfies,
  updateAgentRequestSchema,
  type AgentDto,
  type AgentStatus,
  type AgentVersionDto,
  type Language,
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
  getAgent,
  listAgentVersions,
  publishAgent,
  restoreAgentVersion,
  updateAgent,
} from "@/lib/agents-api";
import { describeError, zodFieldErrors, type FieldErrors } from "@/lib/form";
import { formatDateTime } from "@/lib/datetime";
import { FormField } from "@/components/form-field";
import { TextareaField } from "@/components/textarea-field";
import { SelectField } from "@/components/select-field";
import { AgentStatusBadge } from "@/components/agent-status-badge";

const LANGUAGES: readonly Language[] = languageSchema.options;
const STATUSES: readonly AgentStatus[] = agentStatusSchema.options;

/** Editable form state derived from an {@link AgentDto}. */
interface AgentForm {
  name: string;
  status: AgentStatus;
  defaultLanguage: Language;
  systemPrompt: string;
  greeting: string;
  voiceId: string;
  transferNumber: string;
}

function toForm(agent: AgentDto): AgentForm {
  return {
    name: agent.name,
    status: agent.status,
    defaultLanguage: agent.defaultLanguage,
    systemPrompt: agent.systemPrompt ?? "",
    greeting: agent.greeting ?? "",
    voiceId: agent.voiceId ?? "",
    transferNumber: agent.transferNumber ?? "",
  };
}

/** Empty string → null for nullable fields, so clearing a field persists. */
function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default function AgentDetailPage() {
  const params = useParams<{ id: string }>();
  const agentId = params.id;
  const { activeRole } = useAuth();
  const canManage = activeRole ? roleSatisfies(activeRole, "ADMIN") : false;

  const [agent, setAgent] = useState<AgentDto | null>(null);
  const [form, setForm] = useState<AgentForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const [versions, setVersions] = useState<AgentVersionDto[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishedVersion, setPublishedVersion] = useState<number | null>(null);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);

  const loadAgent = useCallback(async () => {
    setLoadError(null);
    try {
      const result = await getAgent(agentId);
      setAgent(result);
      setForm(toForm(result));
    } catch (err) {
      setLoadError(describeError(err).message);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  const loadVersions = useCallback(async () => {
    try {
      const result = await listAgentVersions(agentId);
      setVersions(result.data);
    } catch {
      // Versions are secondary; a load failure is surfaced on next action.
    }
  }, [agentId]);

  useEffect(() => {
    void loadAgent();
    void loadVersions();
  }, [loadAgent, loadVersions]);

  const update = (patch: Partial<AgentForm>) => {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const onSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form) return;
    setSaveError(null);
    setFieldErrors({});
    setSavedAt(null);

    const parsed = updateAgentRequestSchema.safeParse({
      name: form.name,
      status: form.status,
      defaultLanguage: form.defaultLanguage,
      systemPrompt: nullable(form.systemPrompt),
      greeting: nullable(form.greeting),
      voiceId: nullable(form.voiceId),
      transferNumber: nullable(form.transferNumber),
    });
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }

    setSaving(true);
    try {
      const updated = await updateAgent(agentId, parsed.data);
      setAgent(updated);
      setForm(toForm(updated));
      setSavedAt(new Date().toISOString());
    } catch (err) {
      const described = describeError(err);
      setSaveError(described.message);
      setFieldErrors(described.fieldErrors);
    } finally {
      setSaving(false);
    }
  };

  const onPublish = async () => {
    setPublishError(null);
    setPublishedVersion(null);
    setPublishing(true);
    try {
      const version = await publishAgent(agentId);
      setPublishedVersion(version.version);
      await loadVersions();
    } catch (err) {
      setPublishError(describeError(err).message);
    } finally {
      setPublishing(false);
    }
  };

  const onRestore = async (version: number) => {
    setPublishError(null);
    setRestoringVersion(version);
    try {
      const restored = await restoreAgentVersion(agentId, version);
      setAgent(restored);
      setForm(toForm(restored));
      await loadVersions();
    } catch (err) {
      setPublishError(describeError(err).message);
    } finally {
      setRestoringVersion(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/dashboard/agents" className="text-sm text-muted-foreground underline">
          ← Back to agents
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {agent ? agent.name : "Agent"}
          </h1>
          {agent ? <AgentStatusBadge status={agent.status} /> : null}
        </div>
      </div>

      {loadError ? <Alert variant="destructive">{loadError}</Alert> : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading agent…</p> : null}

      {form ? (
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>
              {canManage
                ? "Edit the agent, then publish to snapshot a new version."
                : "You need the ADMIN role or higher to edit this agent."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={onSave} noValidate>
              {saveError ? <Alert variant="destructive">{saveError}</Alert> : null}
              {savedAt ? <Alert variant="success">Changes saved.</Alert> : null}

              <FormField
                label="Name"
                name="name"
                value={form.name}
                onChange={(e) => update({ name: e.target.value })}
                error={fieldErrors.name}
                disabled={!canManage}
                required
              />

              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="flex-1">
                  <SelectField
                    label="Default language"
                    name="defaultLanguage"
                    value={form.defaultLanguage}
                    onChange={(e) => update({ defaultLanguage: languageSchema.parse(e.target.value) })}
                    error={fieldErrors.defaultLanguage}
                    disabled={!canManage}
                  >
                    {LANGUAGES.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </SelectField>
                </div>
                <div className="flex-1">
                  <SelectField
                    label="Status"
                    name="status"
                    value={form.status}
                    onChange={(e) => update({ status: agentStatusSchema.parse(e.target.value) })}
                    error={fieldErrors.status}
                    disabled={!canManage}
                  >
                    {STATUSES.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </SelectField>
                </div>
              </div>

              <TextareaField
                label="System prompt"
                name="systemPrompt"
                rows={5}
                value={form.systemPrompt}
                onChange={(e) => update({ systemPrompt: e.target.value })}
                error={fieldErrors.systemPrompt}
                disabled={!canManage}
                placeholder="Instructions that shape how the agent responds."
              />

              <TextareaField
                label="Greeting"
                name="greeting"
                rows={3}
                value={form.greeting}
                onChange={(e) => update({ greeting: e.target.value })}
                error={fieldErrors.greeting}
                disabled={!canManage}
                placeholder="The first thing callers hear."
              />

              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="flex-1">
                  <FormField
                    label="Voice ID"
                    name="voiceId"
                    value={form.voiceId}
                    onChange={(e) => update({ voiceId: e.target.value })}
                    error={fieldErrors.voiceId}
                    disabled={!canManage}
                    placeholder="Optional"
                  />
                </div>
                <div className="flex-1">
                  <FormField
                    label="Transfer number"
                    name="transferNumber"
                    value={form.transferNumber}
                    onChange={(e) => update({ transferNumber: e.target.value })}
                    error={fieldErrors.transferNumber}
                    disabled={!canManage}
                    placeholder="e.g. +998901234567"
                  />
                </div>
              </div>

              {canManage ? (
                <div>
                  <Button type="submit" disabled={saving}>
                    {saving ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              ) : null}
            </form>
          </CardContent>
        </Card>
      ) : null}

      {form ? (
        <Card>
          <CardHeader>
            <CardTitle>Versions</CardTitle>
            <CardDescription>
              Publishing snapshots the current configuration as an immutable version.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {publishError ? <Alert variant="destructive">{publishError}</Alert> : null}
            {publishedVersion !== null ? (
              <Alert variant="success">Published version {publishedVersion}.</Alert>
            ) : null}

            {canManage ? (
              <div>
                <Button variant="outline" onClick={() => void onPublish()} disabled={publishing}>
                  {publishing ? "Publishing…" : "Publish current config"}
                </Button>
              </div>
            ) : null}

            {versions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No versions published yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {versions.map((version) => (
                  <li
                    key={version.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-4 py-3"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">Version {version.version}</span>
                      <span className="text-xs text-muted-foreground">
                        Published {formatDateTime(version.publishedAt)}
                      </span>
                    </div>
                    {canManage ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={restoringVersion !== null}
                        onClick={() => void onRestore(version.version)}
                      >
                        {restoringVersion === version.version ? "Restoring…" : "Restore"}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
