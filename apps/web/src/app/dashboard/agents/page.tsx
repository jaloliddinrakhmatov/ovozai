"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createAgentRequestSchema,
  languageSchema,
  roleSatisfies,
  type AgentDto,
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
import { createAgent, deleteAgent, listAgents } from "@/lib/agents-api";
import { describeError, zodFieldErrors, type FieldErrors } from "@/lib/form";
import { FormField } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import { AgentStatusBadge } from "@/components/agent-status-badge";

const LANGUAGES: readonly Language[] = languageSchema.options;

function CreateAgentForm({ onCreated }: { onCreated: (agent: AgentDto) => void }) {
  const [name, setName] = useState("");
  const [defaultLanguage, setDefaultLanguage] = useState<Language>("UZ");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const parsed = createAgentRequestSchema.safeParse({ name, defaultLanguage });
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }

    setSubmitting(true);
    try {
      const agent = await createAgent(parsed.data);
      setName("");
      setDefaultLanguage("UZ");
      onCreated(agent);
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
        <CardTitle>Create an agent</CardTitle>
        <CardDescription>
          Start with a name and primary language. You can configure the prompt, greeting, and
          voice afterwards.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form className="flex flex-col gap-4 sm:flex-row sm:items-end" onSubmit={onSubmit} noValidate>
          <div className="flex-1">
            <FormField
              label="Name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={fieldErrors.name}
              required
            />
          </div>
          <SelectField
            label="Language"
            name="defaultLanguage"
            value={defaultLanguage}
            onChange={(e) => setDefaultLanguage(languageSchema.parse(e.target.value))}
            error={fieldErrors.defaultLanguage}
          >
            {LANGUAGES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </SelectField>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create agent"}
          </Button>
        </form>
        {formError ? <Alert variant="destructive">{formError}</Alert> : null}
      </CardContent>
    </Card>
  );
}

export default function AgentsPage() {
  const router = useRouter();
  const { activeRole } = useAuth();
  const canManage = activeRole ? roleSatisfies(activeRole, "ADMIN") : false;

  const [agents, setAgents] = useState<AgentDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async (cursor?: string) => {
    setLoadError(null);
    try {
      const result = await listAgents(cursor ? { cursor } : undefined);
      setAgents((prev) => (cursor ? [...prev, ...result.data] : result.data));
      setNextCursor(result.pageInfo.hasNextPage ? result.pageInfo.nextCursor : null);
    } catch (err) {
      setLoadError(describeError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reload = useCallback(() => {
    setLoading(true);
    void load();
  }, [load]);

  const onDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteAgent(id);
      reload();
    } catch (err) {
      setLoadError(describeError(err).message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          AI voice agents that answer calls for this organization.
        </p>
      </div>

      {canManage ? (
        <CreateAgentForm onCreated={(agent) => router.push(`/dashboard/agents/${agent.id}`)} />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Your agents</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {loadError ? <Alert variant="destructive">{loadError}</Alert> : null}
          {loading && agents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading agents…</p>
          ) : agents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No agents yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {agents.map((agent) => (
                <li
                  key={agent.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-4 py-3"
                >
                  <div className="flex flex-col">
                    <Link
                      href={`/dashboard/agents/${agent.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {agent.name}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {agent.defaultLanguage}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <AgentStatusBadge status={agent.status} />
                    <Link
                      href={`/dashboard/agents/${agent.id}`}
                      className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      Edit
                    </Link>
                    {canManage ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={deletingId === agent.id}
                        onClick={() => void onDelete(agent.id)}
                      >
                        {deletingId === agent.id ? "Deleting…" : "Delete"}
                      </Button>
                    ) : null}
                  </div>
                </li>
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
