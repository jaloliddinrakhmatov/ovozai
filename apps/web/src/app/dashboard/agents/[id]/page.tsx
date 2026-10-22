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

/** Weekly booking-hours editor (writes `config.booking`, read by the booking tools). */
const DAY_ORDER = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
] as const;
type DayKey = (typeof DAY_ORDER)[number]["key"];

interface DayHours {
  enabled: boolean;
  open: string; // "HH:MM"
  close: string; // "HH:MM"
}

interface BookingForm {
  enforceHours: boolean;
  timezone: string;
  slotMinutes: string;
  capacity: string;
  days: Record<DayKey, DayHours>;
}

function defaultDays(enabled: boolean): Record<DayKey, DayHours> {
  return Object.fromEntries(
    DAY_ORDER.map((d) => [d.key, { enabled, open: "09:00", close: "18:00" }]),
  ) as Record<DayKey, DayHours>;
}

function defaultBooking(): BookingForm {
  return {
    enforceHours: false,
    timezone: "Asia/Tashkent",
    slotMinutes: "30",
    capacity: "1",
    days: defaultDays(true),
  };
}

/** Read `agent.config.booking` into the editor state, tolerating missing/partial config. */
function bookingFromConfig(config: AgentDto["config"]): BookingForm {
  const form = defaultBooking();
  if (!config || typeof config !== "object") return form;
  const booking = (config as Record<string, unknown>).booking;
  if (!booking || typeof booking !== "object") return form;
  const b = booking as Record<string, unknown>;
  if (typeof b.timezone === "string" && b.timezone.trim()) form.timezone = b.timezone;
  if (typeof b.slotMinutes === "number") form.slotMinutes = String(b.slotMinutes);
  if (typeof b.capacity === "number") form.capacity = String(b.capacity);
  if (b.hours && typeof b.hours === "object") {
    form.enforceHours = true;
    const hours = b.hours as Record<string, unknown>;
    for (const { key } of DAY_ORDER) {
      const windows = hours[key];
      const first = Array.isArray(windows) && Array.isArray(windows[0]) ? (windows[0] as unknown[]) : null;
      if (first && typeof first[0] === "string" && typeof first[1] === "string") {
        form.days[key] = { enabled: true, open: first[0], close: first[1] };
      } else {
        form.days[key] = { ...form.days[key], enabled: false };
      }
    }
  }
  return form;
}

type BuildResult = { ok: true; value: Record<string, unknown> } | { ok: false; error: string };

/** Serialize the editor state back into a `config.booking` object (or an error). */
function buildBooking(form: BookingForm): BuildResult {
  const slot = Number(form.slotMinutes);
  if (!Number.isFinite(slot) || slot < 5 || slot > 480) {
    return { ok: false, error: "Slot length must be between 5 and 480 minutes." };
  }
  const capacity = Number(form.capacity);
  if (!Number.isFinite(capacity) || capacity < 1 || capacity > 1000) {
    return { ok: false, error: "Capacity must be at least 1." };
  }
  const booking: Record<string, unknown> = {
    timezone: form.timezone.trim() || "Asia/Tashkent",
    slotMinutes: Math.floor(slot),
    capacity: Math.floor(capacity),
  };
  if (form.enforceHours) {
    const hours: Record<string, string[][]> = {};
    for (const { key, label } of DAY_ORDER) {
      const day = form.days[key];
      if (!day.enabled) {
        hours[key] = [];
        continue;
      }
      if (!/^\d{2}:\d{2}$/.test(day.open) || !/^\d{2}:\d{2}$/.test(day.close) || day.open >= day.close) {
        return { ok: false, error: `${label}: closing time must be after the opening time.` };
      }
      hours[key] = [[day.open, day.close]];
    }
    booking.hours = hours;
  }
  return { ok: true, value: booking };
}

/** Editable form state derived from an {@link AgentDto}. */
interface AgentForm {
  name: string;
  status: AgentStatus;
  defaultLanguage: Language;
  systemPrompt: string;
  greeting: string;
  voiceId: string;
  transferNumber: string;
  booking: BookingForm;
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
    booking: bookingFromConfig(agent.config),
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

  const updateBooking = (patch: Partial<BookingForm>) => {
    setForm((prev) => (prev ? { ...prev, booking: { ...prev.booking, ...patch } } : prev));
  };

  const updateDay = (key: DayKey, patch: Partial<DayHours>) => {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            booking: {
              ...prev.booking,
              days: { ...prev.booking.days, [key]: { ...prev.booking.days[key], ...patch } },
            },
          }
        : prev,
    );
  };

  const onSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form) return;
    setSaveError(null);
    setFieldErrors({});
    setSavedAt(null);

    const booking = buildBooking(form.booking);
    if (!booking.ok) {
      setSaveError(booking.error);
      return;
    }
    // Merge onto the existing config so other keys (e.g. consentAnnouncement) survive.
    const mergedConfig = { ...((agent?.config as Record<string, unknown> | null) ?? {}), booking: booking.value };

    const parsed = updateAgentRequestSchema.safeParse({
      name: form.name,
      status: form.status,
      defaultLanguage: form.defaultLanguage,
      systemPrompt: nullable(form.systemPrompt),
      greeting: nullable(form.greeting),
      voiceId: nullable(form.voiceId),
      transferNumber: nullable(form.transferNumber),
      config: mergedConfig,
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

              <div className="flex flex-col gap-4 rounded-md border border-border p-4">
                <div className="flex flex-col gap-1">
                  <h3 className="text-sm font-semibold">Business hours &amp; booking</h3>
                  <p className="text-xs text-muted-foreground">
                    Controls the appointment tools: the agent won&apos;t book in the past, outside
                    these hours, or past capacity (no double-booking), and offers the nearest open
                    times instead.
                  </p>
                </div>

                <div className="flex flex-col gap-4 sm:flex-row">
                  <div className="flex-1">
                    <FormField
                      label="Timezone"
                      name="timezone"
                      value={form.booking.timezone}
                      onChange={(e) => updateBooking({ timezone: e.target.value })}
                      disabled={!canManage}
                      placeholder="Asia/Tashkent"
                    />
                  </div>
                  <div className="flex-1">
                    <FormField
                      label="Slot length (min)"
                      name="slotMinutes"
                      type="number"
                      min={5}
                      max={480}
                      value={form.booking.slotMinutes}
                      onChange={(e) => updateBooking({ slotMinutes: e.target.value })}
                      disabled={!canManage}
                    />
                  </div>
                  <div className="flex-1">
                    <FormField
                      label="Capacity (parallel appts)"
                      name="capacity"
                      type="number"
                      min={1}
                      value={form.booking.capacity}
                      onChange={(e) => updateBooking({ capacity: e.target.value })}
                      disabled={!canManage}
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={form.booking.enforceHours}
                    onChange={(e) => updateBooking({ enforceHours: e.target.checked })}
                    disabled={!canManage}
                  />
                  Enforce business hours <span className="text-muted-foreground">(off = always open)</span>
                </label>

                {form.booking.enforceHours ? (
                  <div className="flex flex-col gap-2">
                    {DAY_ORDER.map(({ key, label }) => {
                      const day = form.booking.days[key];
                      return (
                        <div key={key} className="flex flex-wrap items-center gap-3">
                          <label className="flex w-32 items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={day.enabled}
                              onChange={(e) => updateDay(key, { enabled: e.target.checked })}
                              disabled={!canManage}
                            />
                            {label}
                          </label>
                          <input
                            type="time"
                            aria-label={`${label} opening time`}
                            className="h-9 rounded-md border border-input bg-background px-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                            value={day.open}
                            onChange={(e) => updateDay(key, { open: e.target.value })}
                            disabled={!canManage || !day.enabled}
                          />
                          <span className="text-sm text-muted-foreground">–</span>
                          <input
                            type="time"
                            aria-label={`${label} closing time`}
                            className="h-9 rounded-md border border-input bg-background px-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                            value={day.close}
                            onChange={(e) => updateDay(key, { close: e.target.value })}
                            disabled={!canManage || !day.enabled}
                          />
                          {!day.enabled ? (
                            <span className="text-xs text-muted-foreground">closed</span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
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
