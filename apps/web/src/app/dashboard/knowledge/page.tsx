"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  createKnowledgeBaseRequestSchema,
  roleSatisfies,
  type AgentDto,
  type KnowledgeBaseDto,
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
import { listAgents } from "@/lib/agents-api";
import {
  createKnowledgeBase,
  deleteKnowledgeBase,
  listKnowledgeBases,
} from "@/lib/knowledge-api";
import { describeError, zodFieldErrors, type FieldErrors } from "@/lib/form";
import { FormField } from "@/components/form-field";
import { SelectField } from "@/components/select-field";

function CreateKnowledgeBaseForm({
  agents,
  onCreated,
}: {
  agents: AgentDto[];
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [agentId, setAgentId] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const parsed = createKnowledgeBaseRequestSchema.safeParse({
      name,
      ...(agentId ? { agentId } : {}),
    });
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }

    setSubmitting(true);
    try {
      await createKnowledgeBase(parsed.data);
      setName("");
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
        <CardTitle>Create a knowledge base</CardTitle>
        <CardDescription>
          Group documents the agent can answer from. Optionally attach it to a single agent.
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
            label="Agent"
            name="agentId"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            error={fieldErrors.agentId}
          >
            <option value="">No agent (shared)</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </SelectField>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create"}
          </Button>
        </form>
        {formError ? <Alert variant="destructive">{formError}</Alert> : null}
      </CardContent>
    </Card>
  );
}

export default function KnowledgePage() {
  const { activeRole } = useAuth();
  const canCreate = activeRole ? roleSatisfies(activeRole, "MEMBER") : false;
  const canDelete = activeRole ? roleSatisfies(activeRole, "ADMIN") : false;

  const [bases, setBases] = useState<KnowledgeBaseDto[]>([]);
  const [agents, setAgents] = useState<AgentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const agentName = useCallback(
    (id: string | null): string | null => {
      if (!id) return null;
      return agents.find((agent) => agent.id === id)?.name ?? null;
    },
    [agents],
  );

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const result = await listKnowledgeBases();
      setBases(result.data);
    } catch (err) {
      setLoadError(describeError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void (async () => {
      try {
        const result = await listAgents();
        setAgents(result.data);
      } catch {
        // Agent list is only used to label/attach; ignore load failures.
      }
    })();
  }, [load]);

  const onDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteKnowledgeBase(id);
      await load();
    } catch (err) {
      setLoadError(describeError(err).message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Knowledge</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Knowledge bases the agent retrieves answers from.
        </p>
      </div>

      {canCreate ? <CreateKnowledgeBaseForm agents={agents} onCreated={load} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Knowledge bases</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {loadError ? <Alert variant="destructive">{loadError}</Alert> : null}
          {loading && bases.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading knowledge bases…</p>
          ) : bases.length === 0 ? (
            <p className="text-sm text-muted-foreground">No knowledge bases yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {bases.map((base) => (
                <li
                  key={base.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-4 py-3"
                >
                  <div className="flex flex-col">
                    <Link
                      href={`/dashboard/knowledge/${base.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {base.name}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {agentName(base.agentId) ?? "Shared across agents"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={base.status === "ACTIVE" ? "success" : "secondary"}>
                      {base.status}
                    </Badge>
                    <Link
                      href={`/dashboard/knowledge/${base.id}`}
                      className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      Open
                    </Link>
                    {canDelete ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={deletingId === base.id}
                        onClick={() => void onDelete(base.id)}
                      >
                        {deletingId === base.id ? "Deleting…" : "Delete"}
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
