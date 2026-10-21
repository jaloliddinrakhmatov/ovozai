import { Badge, type BadgeVariant } from "@ovozai/ui";
import type { WebhookStatus } from "@ovozai/contracts";

const STATUS_VARIANT: Record<WebhookStatus, BadgeVariant> = {
  ACTIVE: "success",
  DISABLED: "secondary",
};

/** Render a webhook endpoint's status as a consistently-styled pill. */
export function WebhookStatusBadge({ status }: { status: WebhookStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>;
}
