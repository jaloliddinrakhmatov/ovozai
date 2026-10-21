import { Badge, type BadgeVariant } from "@ovozai/ui";
import type { NotificationStatus } from "@ovozai/contracts";

const STATUS_VARIANT: Record<NotificationStatus, BadgeVariant> = {
  PENDING: "secondary",
  SENT: "success",
  FAILED: "destructive",
};

/** Render a notification's delivery status as a consistently-styled pill. */
export function NotificationStatusBadge({ status }: { status: NotificationStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>;
}
