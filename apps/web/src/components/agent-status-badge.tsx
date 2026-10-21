import { Badge, type BadgeVariant } from "@ovozai/ui";
import type { AgentStatus } from "@ovozai/contracts";

const STATUS_VARIANT: Record<AgentStatus, BadgeVariant> = {
  DRAFT: "secondary",
  ACTIVE: "success",
  PAUSED: "outline",
  ARCHIVED: "destructive",
};

/** Render an agent lifecycle status as a consistently-styled pill. */
export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>;
}
