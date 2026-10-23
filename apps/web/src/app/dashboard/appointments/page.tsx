"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  appointmentStatusSchema,
  createAppointmentRequestSchema,
  roleSatisfies,
  type AppointmentDto,
  type AppointmentStatus,
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
  Select,
  type BadgeVariant,
} from "@ovozai/ui";
import { useAuth } from "@/lib/auth-context";
import {
  createAppointment,
  deleteAppointment,
  listAppointments,
  updateAppointment,
} from "@/lib/appointments-api";
import { listCustomers } from "@/lib/customers-api";
import { describeError, zodFieldErrors, type FieldErrors } from "@/lib/form";
import { formatDateTime, isoToLocalInput, localInputToIso } from "@/lib/datetime";
import { FormField } from "@/components/form-field";
import { TextareaField } from "@/components/textarea-field";
import { SelectField } from "@/components/select-field";

const STATUSES: readonly AppointmentStatus[] = appointmentStatusSchema.options;

const STATUS_VARIANT: Record<AppointmentStatus, BadgeVariant> = {
  PENDING: "secondary",
  CONFIRMED: "success",
  CANCELED: "destructive",
  COMPLETED: "outline",
  NO_SHOW: "destructive",
};

function CreateAppointmentForm({
  customers,
  onCreated,
}: {
  customers: CustomerDto[];
  onCreated: () => void;
}) {
  const [customerId, setCustomerId] = useState("");
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [notes, setNotes] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const startsIso = localInputToIso(startsAt);
    const endsIso = localInputToIso(endsAt);
    const parsed = createAppointmentRequestSchema.safeParse({
      customerId,
      title,
      ...(startsIso ? { startsAt: startsIso } : { startsAt }),
      ...(endsIso ? { endsAt: endsIso } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    });
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }

    setSubmitting(true);
    try {
      await createAppointment(parsed.data);
      setCustomerId("");
      setTitle("");
      setStartsAt("");
      setEndsAt("");
      setNotes("");
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
        <CardTitle>Book an appointment</CardTitle>
        <CardDescription>Pick a customer, give it a title, and set a start time.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          {formError ? <Alert variant="destructive">{formError}</Alert> : null}

          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex-1">
              <SelectField
                label="Customer"
                name="customerId"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                error={fieldErrors.customerId}
                required
              >
                <option value="">Select a customer…</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name ? `${customer.name} (${customer.phoneE164})` : customer.phoneE164}
                  </option>
                ))}
              </SelectField>
            </div>
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
          </div>

          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex-1">
              <FormField
                label="Starts at"
                name="startsAt"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                error={fieldErrors.startsAt}
                required
              />
            </div>
            <div className="flex-1">
              <FormField
                label="Ends at"
                name="endsAt"
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                error={fieldErrors.endsAt}
              />
            </div>
          </div>

          <TextareaField
            label="Notes"
            name="notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            error={fieldErrors.notes}
            placeholder="Optional"
          />

          <div>
            <Button type="submit" disabled={submitting || customers.length === 0}>
              {submitting ? "Booking…" : "Book appointment"}
            </Button>
          </div>
          {customers.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Add a customer first before booking an appointment.
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

function AppointmentRow({
  appointment,
  customerLabel,
  canManage,
  onChanged,
}: {
  appointment: AppointmentDto;
  customerLabel: string;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [newStart, setNewStart] = useState(() => isoToLocalInput(appointment.startsAt));

  const onStatusChange = async (status: AppointmentStatus) => {
    if (status === appointment.status) return;
    setError(null);
    setBusy(true);
    try {
      await updateAppointment(appointment.id, { status });
      onChanged();
    } catch (err) {
      setError(describeError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const onReschedule = async () => {
    const startsAt = localInputToIso(newStart);
    if (!startsAt) {
      setError("Enter a valid date and time.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await updateAppointment(appointment.id, { startsAt });
      setRescheduling(false);
      onChanged();
    } catch (err) {
      setError(describeError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!window.confirm(`Delete the appointment "${appointment.title}"? This can't be undone.`)) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await deleteAppointment(appointment.id);
      onChanged();
    } catch (err) {
      setError(describeError(err).message);
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-col gap-2 rounded-md border border-border px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="font-medium">{appointment.title}</span>
          <span className="text-xs text-muted-foreground">
            {customerLabel} · {formatDateTime(appointment.startsAt)}
          </span>
          {appointment.callId ? (
            <Link
              href={`/dashboard/calls/${appointment.callId}`}
              className="text-xs text-muted-foreground underline underline-offset-2"
            >
              📞 Booked by the AI — view call
            </Link>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {canManage ? (
            <Select
              aria-label={`Status for ${appointment.title}`}
              className="h-9 w-auto"
              value={appointment.status}
              disabled={busy}
              onChange={(e) => void onStatusChange(appointmentStatusSchema.parse(e.target.value))}
            >
              {STATUSES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          ) : (
            <Badge variant={STATUS_VARIANT[appointment.status]}>{appointment.status}</Badge>
          )}
          {canManage ? (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => setRescheduling((prev) => !prev)}
              >
                Reschedule
              </Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void onDelete()}>
                Delete
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {rescheduling ? (
        <div className="flex flex-wrap items-end gap-2">
          <FormField
            label="New start"
            name="newStart"
            type="datetime-local"
            value={newStart}
            onChange={(e) => setNewStart(e.target.value)}
          />
          <Button size="sm" disabled={busy} onClick={() => void onReschedule()}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      ) : null}

      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </li>
  );
}

export default function AppointmentsPage() {
  const { activeRole } = useAuth();
  const canManage = activeRole ? roleSatisfies(activeRole, "MEMBER") : false;

  const [appointments, setAppointments] = useState<AppointmentDto[]>([]);
  const [customers, setCustomers] = useState<CustomerDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [statusDraft, setStatusDraft] = useState("");
  const [fromDraft, setFromDraft] = useState("");
  const [toDraft, setToDraft] = useState("");
  const [filters, setFilters] = useState<{
    status?: AppointmentStatus;
    from?: string;
    to?: string;
  }>({});

  const customerLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const customer of customers) {
      map.set(customer.id, customer.name ? `${customer.name} (${customer.phoneE164})` : customer.phoneE164);
    }
    return map;
  }, [customers]);

  const load = useCallback(
    async (cursor?: string) => {
      setLoadError(null);
      try {
        const result = await listAppointments({ ...filters, ...(cursor ? { cursor } : {}) });
        setAppointments((prev) => (cursor ? [...prev, ...result.data] : result.data));
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

  useEffect(() => {
    void (async () => {
      try {
        const result = await listCustomers({ limit: 100 });
        setCustomers(result.data);
      } catch {
        // Customer list only labels rows / fills the create select; ignore failures.
      }
    })();
  }, []);

  const reload = useCallback(() => {
    setLoading(true);
    void load();
  }, [load]);

  const onApplyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fromIso = localInputToIso(fromDraft);
    const toIso = localInputToIso(toDraft);
    setFilters({
      ...(statusDraft ? { status: appointmentStatusSchema.parse(statusDraft) } : {}),
      ...(fromIso ? { from: fromIso } : {}),
      ...(toIso ? { to: toIso } : {}),
    });
  };

  const onClearFilters = () => {
    setStatusDraft("");
    setFromDraft("");
    setToDraft("");
    setFilters({});
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Appointments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bookings made for this organization&apos;s customers.
        </p>
      </div>

      {canManage ? (
        <CreateAppointmentForm customers={customers} onCreated={reload} />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={onApplyFilters}
          >
            <SelectField
              label="Status"
              name="status"
              value={statusDraft}
              onChange={(e) => setStatusDraft(e.target.value)}
            >
              <option value="">All statuses</option>
              {STATUSES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </SelectField>
            <FormField
              label="From"
              name="from"
              type="datetime-local"
              value={fromDraft}
              onChange={(e) => setFromDraft(e.target.value)}
            />
            <FormField
              label="To"
              name="to"
              type="datetime-local"
              value={toDraft}
              onChange={(e) => setToDraft(e.target.value)}
            />
            <div className="flex gap-2">
              <Button type="submit">Apply</Button>
              <Button type="button" variant="outline" onClick={onClearFilters}>
                Clear
              </Button>
            </div>
          </form>

          {loadError ? <Alert variant="destructive">{loadError}</Alert> : null}
          {loading && appointments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading appointments…</p>
          ) : appointments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No appointments found.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {appointments.map((appointment) => (
                <AppointmentRow
                  key={appointment.id}
                  appointment={appointment}
                  customerLabel={customerLabels.get(appointment.customerId) ?? appointment.customerId}
                  canManage={canManage}
                  onChanged={reload}
                />
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
