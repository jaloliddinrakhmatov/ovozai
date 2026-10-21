import { Badge, type BadgeVariant } from "@ovozai/ui";
import type { CallStatus } from "@ovozai/contracts";

const STATUS_VARIANT: Record<CallStatus, BadgeVariant> = {
  QUEUED: "secondary",
  RINGING: "secondary",
  IN_PROGRESS: "default",
  COMPLETED: "success",
  FAILED: "destructive",
  NO_ANSWER: "outline",
  BUSY: "outline",
  CANCELED: "outline",
  TRANSFERRED: "default",
};

/** Render a call lifecycle status as a consistently-styled pill. */
export function CallStatusBadge({ status }: { status: CallStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>;
}
