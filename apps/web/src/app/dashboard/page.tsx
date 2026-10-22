"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  createOrganizationRequestSchema,
  type AppointmentDto,
  type CallDto,
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
import { describeError, zodFieldErrors, type FieldErrors } from "@/lib/form";
import { FormField } from "@/components/form-field";
import { RoleBadge } from "@/components/role-badge";
import { CallStatusBadge } from "@/components/call-status-badge";
import { listCalls } from "@/lib/calls-api";
import { listAppointments } from "@/lib/appointments-api";
import { formatDateTime } from "@/lib/datetime";

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

/** At-a-glance snapshot: what the AI has been doing lately. */
function ActivitySnapshot({ orgId }: { orgId: string }) {
  const [calls, setCalls] = useState<CallDto[]>([]);
  const [appointments, setAppointments] = useState<AppointmentDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [callPage, apptPage] = await Promise.all([
          listCalls({ limit: 5 }),
          listAppointments({ from: new Date().toISOString(), limit: 5 }),
        ]);
        if (cancelled) return;
        setCalls(callPage.data);
        // API returns newest-first; show the soonest upcoming appointments first.
        setAppointments(
          [...apptPage.data].sort(
            (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
          ),
        );
      } catch {
        // Snapshot is best-effort; the rest of the page still works.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Recent calls</CardTitle>
          <CardDescription>The latest calls your agents handled.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : calls.length === 0 ? (
            <p className="text-sm text-muted-foreground">No calls yet.</p>
          ) : (
            <>
              {calls.map((call) => (
                <Link
                  key={call.id}
                  href={`/dashboard/calls/${call.id}`}
                  className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 hover:bg-muted/50"
                >
                  <span className="text-sm">
                    {formatDateTime(call.startedAt)} · {call.language}
                  </span>
                  <CallStatusBadge status={call.status} />
                </Link>
              ))}
              <Link href="/dashboard/calls" className="text-xs text-muted-foreground underline underline-offset-2">
                View all calls
              </Link>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming appointments</CardTitle>
          <CardDescription>What's booked next.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : appointments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing upcoming.</p>
          ) : (
            <>
              {appointments.map((appointment) => (
                <div
                  key={appointment.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{appointment.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(appointment.startsAt)}
                      {appointment.callId ? " · booked by AI" : ""}
                    </span>
                  </div>
                  <Badge variant="outline">{appointment.status}</Badge>
                </div>
              ))}
              <Link
                href="/dashboard/appointments"
                className="text-xs text-muted-foreground underline underline-offset-2"
              >
                View all appointments
              </Link>
            </>
          )}
        </CardContent>
      </Card>
    </div>
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

      {activeOrganization ? <ActivitySnapshot orgId={activeOrganization.id} /> : null}

      {memberships.length > 0 ? <OrganizationSwitcher /> : <CreateOrganization />}
    </div>
  );
}
