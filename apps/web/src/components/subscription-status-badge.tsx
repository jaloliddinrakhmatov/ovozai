import { Badge, type BadgeVariant } from "@ovozai/ui";
import type { SubscriptionStatus } from "@ovozai/contracts";

const STATUS_VARIANT: Record<SubscriptionStatus, BadgeVariant> = {
  TRIALING: "secondary",
  ACTIVE: "success",
  PAST_DUE: "destructive",
  CANCELED: "secondary",
  INCOMPLETE: "outline",
};

/** Render a subscription's status as a consistently-styled pill. */
export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>;
}
