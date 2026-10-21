"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  createCustomerRequestSchema,
  roleSatisfies,
  type CustomerDto,
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
import { createCustomer, deleteCustomer, listCustomers } from "@/lib/customers-api";
import { describeError, zodFieldErrors, type FieldErrors } from "@/lib/form";
import { FormField } from "@/components/form-field";

function CreateCustomerForm({ onCreated }: { onCreated: () => void }) {
  const [phoneE164, setPhoneE164] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const parsed = createCustomerRequestSchema.safeParse({
      phoneE164,
      ...(name.trim() ? { name: name.trim() } : {}),
      ...(email.trim() ? { email: email.trim() } : {}),
    });
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }

    setSubmitting(true);
    try {
      await createCustomer(parsed.data);
      setPhoneE164("");
      setName("");
      setEmail("");
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
        <CardTitle>Add a customer</CardTitle>
        <CardDescription>
          A phone number in E.164 format is required. More details can be edited later.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          {formError ? <Alert variant="destructive">{formError}</Alert> : null}
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex-1">
              <FormField
                label="Phone (E.164)"
                name="phoneE164"
                value={phoneE164}
                onChange={(e) => setPhoneE164(e.target.value)}
                error={fieldErrors.phoneE164}
                placeholder="+998901234567"
                required
              />
            </div>
            <div className="flex-1">
              <FormField
                label="Name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                error={fieldErrors.name}
                placeholder="Optional"
              />
            </div>
            <div className="flex-1">
              <FormField
                label="Email"
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={fieldErrors.email}
                placeholder="Optional"
              />
            </div>
          </div>
          <div>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Adding…" : "Add customer"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default function CustomersPage() {
  const { activeRole } = useAuth();
  const canCreate = activeRole ? roleSatisfies(activeRole, "MEMBER") : false;
  const canDelete = activeRole ? roleSatisfies(activeRole, "ADMIN") : false;

  const [customers, setCustomers] = useState<CustomerDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Draft filter inputs vs the applied filters used for fetching.
  const [qDraft, setQDraft] = useState("");
  const [phoneDraft, setPhoneDraft] = useState("");
  const [filters, setFilters] = useState<{ q?: string; phoneE164?: string }>({});

  const load = useCallback(
    async (cursor?: string) => {
      setLoadError(null);
      try {
        const result = await listCustomers({ ...filters, ...(cursor ? { cursor } : {}) });
        setCustomers((prev) => (cursor ? [...prev, ...result.data] : result.data));
        setNextCursor(result.pageInfo.hasNextPage ? result.pageInfo.nextCursor : null);
      } catch (err) {
        setLoadError(describeError(err).message);
      } finally {
        setLoading(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFilters({
      ...(qDraft.trim() ? { q: qDraft.trim() } : {}),
      ...(phoneDraft.trim() ? { phoneE164: phoneDraft.trim() } : {}),
    });
  };

  const onClear = () => {
    setQDraft("");
    setPhoneDraft("");
    setFilters({});
  };

  const onDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteCustomer(id);
      setLoading(true);
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
        <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          People who have contacted or been contacted by this organization.
        </p>
      </div>

      {canCreate ? <CreateCustomerForm onCreated={() => setFilters({ ...filters })} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Directory</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={onSearch}>
            <div className="flex-1">
              <FormField
                label="Search"
                name="q"
                value={qDraft}
                onChange={(e) => setQDraft(e.target.value)}
                placeholder="Name, email, or notes"
              />
            </div>
            <div className="flex-1">
              <FormField
                label="Phone"
                name="phoneE164"
                value={phoneDraft}
                onChange={(e) => setPhoneDraft(e.target.value)}
                placeholder="+998…"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit">Search</Button>
              <Button type="button" variant="outline" onClick={onClear}>
                Clear
              </Button>
            </div>
          </form>

          {loadError ? <Alert variant="destructive">{loadError}</Alert> : null}
          {loading && customers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading customers…</p>
          ) : customers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No customers found.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {customers.map((customer) => (
                <li
                  key={customer.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-4 py-3"
                >
                  <div className="flex flex-col">
                    <Link
                      href={`/dashboard/customers/${customer.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {customer.name ?? customer.phoneE164}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {customer.phoneE164}
                      {customer.email ? ` · ${customer.email}` : ""}
                    </span>
                    {customer.tags.length > 0 ? (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {customer.tags.map((tag) => (
                          <Badge key={tag} variant="outline">
                            {tag}
                          </Badge>
                        ))}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/dashboard/customers/${customer.id}`}
                      className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      Edit
                    </Link>
                    {canDelete ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={deletingId === customer.id}
                        onClick={() => void onDelete(customer.id)}
                      >
                        {deletingId === customer.id ? "Deleting…" : "Delete"}
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
