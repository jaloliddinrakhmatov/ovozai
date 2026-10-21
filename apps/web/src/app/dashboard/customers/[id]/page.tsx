"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  roleSatisfies,
  updateCustomerRequestSchema,
  type CustomerDto,
  type UpdateCustomerRequest,
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
import { deleteCustomer, getCustomer, updateCustomer } from "@/lib/customers-api";
import { describeError, zodFieldErrors, type FieldErrors } from "@/lib/form";
import { FormField } from "@/components/form-field";
import { TextareaField } from "@/components/textarea-field";

interface CustomerForm {
  phoneE164: string;
  name: string;
  email: string;
  locale: string;
  notes: string;
  tags: string;
}

function toForm(customer: CustomerDto): CustomerForm {
  return {
    phoneE164: customer.phoneE164,
    name: customer.name ?? "",
    email: customer.email ?? "",
    locale: customer.locale,
    notes: customer.notes ?? "",
    tags: customer.tags.join(", "),
  };
}

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const customerId = params.id;
  const router = useRouter();
  const { activeRole } = useAuth();
  const canManage = activeRole ? roleSatisfies(activeRole, "MEMBER") : false;
  const canDelete = activeRole ? roleSatisfies(activeRole, "ADMIN") : false;

  const [form, setForm] = useState<CustomerForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadCustomer = useCallback(async () => {
    setLoadError(null);
    try {
      const customer = await getCustomer(customerId);
      setForm(toForm(customer));
    } catch (err) {
      setLoadError(describeError(err).message);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void loadCustomer();
  }, [loadCustomer]);

  const update = (patch: Partial<CustomerForm>) => {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const onSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form) return;
    setSaveError(null);
    setFieldErrors({});
    setSaved(false);

    const tags = form.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    const payload: UpdateCustomerRequest = {
      phoneE164: form.phoneE164,
      name: nullable(form.name),
      email: nullable(form.email),
      notes: nullable(form.notes),
      tags,
      // locale is not nullable server-side: only send it when non-empty.
      ...(form.locale.trim() ? { locale: form.locale.trim() } : {}),
    };

    const parsed = updateCustomerRequestSchema.safeParse(payload);
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }

    setSaving(true);
    try {
      const updated = await updateCustomer(customerId, parsed.data);
      setForm(toForm(updated));
      setSaved(true);
    } catch (err) {
      const described = describeError(err);
      setSaveError(described.message);
      setFieldErrors(described.fieldErrors);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    setSaveError(null);
    setDeleting(true);
    try {
      await deleteCustomer(customerId);
      router.push("/dashboard/customers");
    } catch (err) {
      setSaveError(describeError(err).message);
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/dashboard/customers" className="text-sm text-muted-foreground underline">
          ← Back to customers
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {form ? (form.name || form.phoneE164) : "Customer"}
        </h1>
      </div>

      {loadError ? <Alert variant="destructive">{loadError}</Alert> : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading customer…</p> : null}

      {form ? (
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>
              {canManage
                ? "Edit contact details, notes, and tags."
                : "You need the MEMBER role or higher to edit customers."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={onSave} noValidate>
              {saveError ? <Alert variant="destructive">{saveError}</Alert> : null}
              {saved ? <Alert variant="success">Customer saved.</Alert> : null}

              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="flex-1">
                  <FormField
                    label="Phone (E.164)"
                    name="phoneE164"
                    value={form.phoneE164}
                    onChange={(e) => update({ phoneE164: e.target.value })}
                    error={fieldErrors.phoneE164}
                    disabled={!canManage}
                    required
                  />
                </div>
                <div className="flex-1">
                  <FormField
                    label="Name"
                    name="name"
                    value={form.name}
                    onChange={(e) => update({ name: e.target.value })}
                    error={fieldErrors.name}
                    disabled={!canManage}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="flex-1">
                  <FormField
                    label="Email"
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={(e) => update({ email: e.target.value })}
                    error={fieldErrors.email}
                    disabled={!canManage}
                  />
                </div>
                <div className="flex-1">
                  <FormField
                    label="Locale"
                    name="locale"
                    value={form.locale}
                    onChange={(e) => update({ locale: e.target.value })}
                    error={fieldErrors.locale}
                    disabled={!canManage}
                    placeholder="e.g. uz-UZ"
                  />
                </div>
              </div>

              <FormField
                label="Tags"
                name="tags"
                value={form.tags}
                onChange={(e) => update({ tags: e.target.value })}
                error={fieldErrors.tags}
                disabled={!canManage}
                placeholder="Comma separated, e.g. vip, returning"
              />

              <TextareaField
                label="Notes"
                name="notes"
                rows={4}
                value={form.notes}
                onChange={(e) => update({ notes: e.target.value })}
                error={fieldErrors.notes}
                disabled={!canManage}
              />

              {canManage ? (
                <div className="flex items-center gap-2">
                  <Button type="submit" disabled={saving}>
                    {saving ? "Saving…" : "Save changes"}
                  </Button>
                  {canDelete ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={deleting}
                      onClick={() => void onDelete()}
                    >
                      {deleting ? "Deleting…" : "Delete"}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
