import { Badge, type BadgeVariant } from "@ovozai/ui";
import type { WebhookDeliveryStatus } from "@ovozai/contracts";

const STATUS_VARIANT: Record<WebhookDeliveryStatus, BadgeVariant> = {
  PENDING: "secondary",
  SUCCEEDED: "success",
  FAILED: "destructive",
};

/** Render a webhook delivery attempt's status as a consistently-styled pill. */
export function WebhookDeliveryStatusBadge({ status }: { status: WebhookDeliveryStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>;
}
