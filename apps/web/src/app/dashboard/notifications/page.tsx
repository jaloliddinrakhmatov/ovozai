"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  notificationStatusSchema,
  type NotificationDto,
  type NotificationStatus,
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
import { listNotifications } from "@/lib/notifications-api";
import { describeError } from "@/lib/form";
import { formatDateTime } from "@/lib/datetime";
import { FormField } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import { NotificationStatusBadge } from "@/components/notification-status-badge";

const NOTIFICATION_STATUSES: readonly NotificationStatus[] = notificationStatusSchema.options;

function preview(body: string): string {
  const trimmed = body.trim();
  return trimmed.length > 140 ? `${trimmed.slice(0, 140)}…` : trimmed;
}

function NotificationRow({ notification }: { notification: NotificationDto }) {
  return (
    <li className="flex flex-col gap-1 rounded-md border border-border px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium">{notification.event}</span>
          <span className="text-xs text-muted-foreground">{notification.channel}</span>
        </div>
        <NotificationStatusBadge status={notification.status} />
      </div>
      {notification.subject ? <span className="text-sm">{notification.subject}</span> : null}
      {notification.body ? (
        <span className="text-xs text-muted-foreground">{preview(notification.body)}</span>
      ) : null}
      <span className="text-xs text-muted-foreground">
        {notification.recipient ?? "—"} ·{" "}
        {formatDateTime(notification.sentAt ?? notification.createdAt)}
      </span>
    </li>
  );
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Applied filters, committed through the filter form below.
  const [event, setEvent] = useState("");
  const [status, setStatus] = useState<NotificationStatus | "">("");

  // Draft inputs the viewer edits before applying.
  const [eventDraft, setEventDraft] = useState("");
  const [statusDraft, setStatusDraft] = useState<NotificationStatus | "">("");

  const load = useCallback(
    async (cursor?: string) => {
      setLoadError(null);
      try {
        const result = await listNotifications({
          ...(event ? { event } : {}),
          ...(status ? { status } : {}),
          ...(cursor ? { cursor } : {}),
        });
        setNotifications((prev) => (cursor ? [...prev, ...result.data] : result.data));
        setNextCursor(result.pageInfo.hasNextPage ? result.pageInfo.nextCursor : null);
      } catch (err) {
        setLoadError(describeError(err).message);
      } finally {
        setLoading(false);
      }
    },
    [event, status],
  );

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const onApplyFilters = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    setEvent(eventDraft.trim());
    setStatus(statusDraft);
  };

  const onClearFilters = () => {
    setEventDraft("");
    setStatusDraft("");
    setEvent("");
    setStatus("");
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Email, SMS, and in-app messages sent for this organization, newest first.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Delivery log</CardTitle>
          <CardDescription>Filter by event name or delivery status.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4"
            onSubmit={onApplyFilters}
            noValidate
          >
            <div className="sm:flex-1">
              <FormField
                label="Event"
                name="event"
                value={eventDraft}
                onChange={(e) => setEventDraft(e.target.value)}
                placeholder="appointment.booked"
              />
            </div>
            <div className="sm:w-48">
              <SelectField
                label="Status"
                name="status"
                value={statusDraft}
                onChange={(e) =>
                  setStatusDraft(
                    e.target.value ? notificationStatusSchema.parse(e.target.value) : "",
                  )
                }
              >
                <option value="">All statuses</option>
                {NOTIFICATION_STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className="flex gap-2">
              <Button type="submit">Apply</Button>
              <Button type="button" variant="outline" onClick={onClearFilters}>
                Clear
              </Button>
            </div>
          </form>

          {loadError ? <Alert variant="destructive">{loadError}</Alert> : null}
          {loading && notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading notifications…</p>
          ) : notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notifications match these filters.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {notifications.map((notification) => (
                <NotificationRow key={notification.id} notification={notification} />
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
