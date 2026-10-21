import { Badge, type BadgeVariant } from "@ovozai/ui";
import type { IntegrationStatus } from "@ovozai/contracts";

const STATUS_VARIANT: Record<IntegrationStatus, BadgeVariant> = {
  CONNECTED: "success",
  DISCONNECTED: "secondary",
  ERROR: "destructive",
};

/** Render an integration's connection status as a consistently-styled pill. */
export function IntegrationStatusBadge({ status }: { status: IntegrationStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>;
}
