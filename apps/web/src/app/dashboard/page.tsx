"use client";

import { useState, type FormEvent } from "react";
import { createOrganizationRequestSchema } from "@ovozai/contracts";
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
import { describeError, zodFieldErrors, type FieldErrors } from "@/lib/form";
import { FormField } from "@/components/form-field";
import { RoleBadge } from "@/components/role-badge";

function CreateOrganization() {
  const { createOrganization } = useAuth();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const parsed = createOrganizationRequestSchema.safeParse({
      name,
      ...(slug.trim() ? { slug: slug.trim() } : {}),
    });
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }

    setSubmitting(true);
    try {
      await createOrganization(parsed.data);
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
        <CardTitle>Create your organization</CardTitle>
        <CardDescription>
          You are not a member of any organization yet. Create one to get started — you
          will become its owner.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex max-w-sm flex-col gap-4" onSubmit={onSubmit} noValidate>
          {formError ? <Alert variant="destructive">{formError}</Alert> : null}
          <FormField
            label="Organization name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={fieldErrors.name}
            required
          />
          <FormField
            label="Slug"
            name="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            error={fieldErrors.slug}
            placeholder="Optional — derived from the name"
          />
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create organization"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function OrganizationSwitcher() {
  const { memberships, activeOrganization, switchOrg } = useAuth();
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSwitch = async (organizationId: string) => {
    setError(null);
    setSwitchingId(organizationId);
    try {
      await switchOrg(organizationId);
    } catch (err) {
      setError(describeError(err).message);
    } finally {
      setSwitchingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your organizations</CardTitle>
        <CardDescription>Switch the active organization for this session.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error ? <Alert variant="destructive">{error}</Alert> : null}
        <ul className="flex flex-col gap-2">
          {memberships.map((membership) => {
            const isActive = membership.organization.id === activeOrganization?.id;
            return (
              <li
                key={membership.organization.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-4 py-3"
              >
                <div className="flex flex-col">
                  <span className="font-medium">{membership.organization.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {membership.organization.slug}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <RoleBadge role={membership.role} />
                  {isActive ? (
                    <Badge variant="success">Active</Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={switchingId !== null}
                      onClick={() => void onSwitch(membership.organization.id)}
                    >
                      {switchingId === membership.organization.id ? "Switching…" : "Switch"}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

export default function DashboardOverviewPage() {
  const { user, activeOrganization, activeRole, memberships } = useAuth();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as {user?.name ?? user?.email}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active organization</CardTitle>
        </CardHeader>
        <CardContent>
          {activeOrganization ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-lg font-medium">{activeOrganization.name}</span>
              <span className="text-sm text-muted-foreground">
                {activeOrganization.slug}
              </span>
              {activeRole ? <RoleBadge role={activeRole} /> : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No active organization.</p>
          )}
        </CardContent>
      </Card>

      {memberships.length > 0 ? <OrganizationSwitcher /> : <CreateOrganization />}
    </div>
  );
}
