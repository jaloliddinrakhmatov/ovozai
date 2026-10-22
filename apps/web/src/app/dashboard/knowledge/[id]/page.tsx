"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  createKnowledgeDocumentRequestSchema,
  retrievalQueryRequestSchema,
  roleSatisfies,
  type KnowledgeDocumentDto,
  type KnowledgeDocumentStatus,
  type KnowledgeSourceType,
  type RetrievalResult,
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
import {
  createKnowledgeDocument,
  deleteKnowledgeDocument,
  listKnowledgeBases,
  listKnowledgeDocuments,
  queryKnowledgeBase,
} from "@/lib/knowledge-api";
import { describeError, zodFieldErrors, type FieldErrors } from "@/lib/form";
import { formatDateTime } from "@/lib/datetime";
import { FormField } from "@/components/form-field";
import { TextareaField } from "@/components/textarea-field";
import { SelectField } from "@/components/select-field";

const DOC_SOURCE_TYPES: readonly KnowledgeSourceType[] = ["TEXT", "FAQ"];

const DOC_STATUS_VARIANT: Record<KnowledgeDocumentStatus, BadgeVariant> = {
  PENDING: "secondary",
  PROCESSING: "secondary",
  READY: "success",
  FAILED: "destructive",
};

/** True while a document is still being ingested (chunked + embedded). */
function isInFlight(status: KnowledgeDocumentStatus): boolean {
  return status === "PENDING" || status === "PROCESSING";
}

function AddDocumentForm({
  knowledgeBaseId,
  onAdded,
}: {
  knowledgeBaseId: string;
  onAdded: () => void;
}) {
  const [title, setTitle] = useState("");
  const [sourceType, setSourceType] = useState<KnowledgeSourceType>("TEXT");
  const [content, setContent] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const parsed = createKnowledgeDocumentRequestSchema.safeParse({ title, sourceType, content });
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }

    setSubmitting(true);
    try {
      await createKnowledgeDocument(knowledgeBaseId, parsed.data);
      setTitle("");
      setContent("");
      setSourceType("TEXT");
      onAdded();
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
        <CardTitle>Add a document</CardTitle>
        <CardDescription>
          Paste text or an FAQ. Ingestion (chunking + embedding) runs in the background.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          {formError ? <Alert variant="destructive">{formError}</Alert> : null}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <FormField
                label="Title"
                name="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                error={fieldErrors.title}
                required
              />
            </div>
            <SelectField
              label="Source type"
              name="sourceType"
              value={sourceType}
              onChange={(e) =>
                setSourceType(e.target.value === "FAQ" ? "FAQ" : "TEXT")
              }
              error={fieldErrors.sourceType}
            >
              {DOC_SOURCE_TYPES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </SelectField>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Choose <strong>FAQ</strong> for Q&amp;A or lists (hours, address, prices, services) —
              separate each item with a blank line and each is indexed on its own for sharper
              answers. Use <strong>TEXT</strong> for longer prose.
            </p>
          </div>
          <TextareaField
            label="Content"
            name="content"
            rows={6}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            error={fieldErrors.content}
            required
          />
          <div>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Adding…" : "Add document"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function SearchPanel({ knowledgeBaseId }: { knowledgeBaseId: string }) {
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState("5");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<RetrievalResult[] | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    const parsed = retrievalQueryRequestSchema.safeParse({ query, topK });
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }

    setSearching(true);
    try {
      const response = await queryKnowledgeBase(knowledgeBaseId, parsed.data);
      setResults(response.results);
    } catch (err) {
      setError(describeError(err).message);
    } finally {
      setSearching(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Search</CardTitle>
        <CardDescription>
          Retrieve the most relevant chunks, ranked by cosine similarity.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form className="flex flex-col gap-4 sm:flex-row sm:items-end" onSubmit={onSubmit} noValidate>
          <div className="flex-1">
            <FormField
              label="Query"
              name="query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              error={fieldErrors.query}
              required
            />
          </div>
          <div className="w-24">
            <FormField
              label="Top K"
              name="topK"
              type="number"
              min={1}
              max={20}
              value={topK}
              onChange={(e) => setTopK(e.target.value)}
              error={fieldErrors.topK}
            />
          </div>
          <Button type="submit" disabled={searching}>
            {searching ? "Searching…" : "Search"}
          </Button>
        </form>

        {error ? <Alert variant="destructive">{error}</Alert> : null}

        {results !== null ? (
          results.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matching chunks found.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {results.map((result) => (
                <li
                  key={result.chunkId}
                  className="flex flex-col gap-1 rounded-md border border-border px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">
                      {result.documentTitle}{" "}
                      <span className="text-xs text-muted-foreground">#{result.ordinal}</span>
                    </span>
                    <Badge variant="outline">{result.score.toFixed(3)}</Badge>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {result.content}
                  </p>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function KnowledgeBaseDetailPage() {
  const params = useParams<{ id: string }>();
  const knowledgeBaseId = params.id;
  const { activeRole } = useAuth();
  const canManage = activeRole ? roleSatisfies(activeRole, "MEMBER") : false;

  const [name, setName] = useState<string | null>(null);
  const [documents, setDocuments] = useState<KnowledgeDocumentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    try {
      const result = await listKnowledgeDocuments(knowledgeBaseId);
      setDocuments(result.data);
      setLoadError(null);
    } catch (err) {
      setLoadError(describeError(err).message);
    } finally {
      setLoading(false);
    }
  }, [knowledgeBaseId]);

  // Resolve the KB name (best-effort — there is no single-KB GET endpoint).
  useEffect(() => {
    void (async () => {
      try {
        const result = await listKnowledgeBases();
        setName(result.data.find((base) => base.id === knowledgeBaseId)?.name ?? null);
      } catch {
        // Non-critical: fall back to the id in the heading.
      }
    })();
  }, [knowledgeBaseId]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const hasInFlight = useMemo(
    () => documents.some((doc) => isInFlight(doc.status)),
    [documents],
  );

  // Poll every 2s while any document is still being ingested.
  useEffect(() => {
    if (!hasInFlight) return;
    const timer = window.setInterval(() => {
      void loadDocuments();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [hasInFlight, loadDocuments]);

  const onDelete = async (documentId: string) => {
    setDeletingId(documentId);
    try {
      await deleteKnowledgeDocument(knowledgeBaseId, documentId);
      await loadDocuments();
    } catch (err) {
      setLoadError(describeError(err).message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/dashboard/knowledge" className="text-sm text-muted-foreground underline">
          ← Back to knowledge bases
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {name ?? "Knowledge base"}
        </h1>
      </div>

      {canManage ? (
        <AddDocumentForm knowledgeBaseId={knowledgeBaseId} onAdded={loadDocuments} />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
          <CardDescription>
            {hasInFlight
              ? "Checking ingestion status…"
              : "Ingested documents available for retrieval."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {loadError ? <Alert variant="destructive">{loadError}</Alert> : null}
          {loading && documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading documents…</p>
          ) : documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No documents yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  className="flex flex-col gap-1 rounded-md border border-border px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-col">
                      <span className="font-medium">{doc.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {doc.sourceType} · updated {formatDateTime(doc.updatedAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={DOC_STATUS_VARIANT[doc.status]}>{doc.status}</Badge>
                      {doc.status === "READY" ? (
                        <span className="text-xs text-muted-foreground">
                          {doc.chunkCount} chunk{doc.chunkCount === 1 ? "" : "s"}
                        </span>
                      ) : null}
                      {canManage ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={deletingId === doc.id}
                          onClick={() => void onDelete(doc.id)}
                        >
                          {deletingId === doc.id ? "Deleting…" : "Delete"}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {doc.status === "FAILED" && doc.error ? (
                    <Alert variant="destructive">{doc.error}</Alert>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <SearchPanel knowledgeBaseId={knowledgeBaseId} />
    </div>
  );
}
