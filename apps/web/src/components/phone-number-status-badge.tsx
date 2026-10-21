import { Badge, type BadgeVariant } from "@ovozai/ui";
import type { PhoneNumberStatus } from "@ovozai/contracts";

const STATUS_VARIANT: Record<PhoneNumberStatus, BadgeVariant> = {
  ACTIVE: "success",
  INACTIVE: "secondary",
  PORTING: "outline",
  RELEASED: "destructive",
};

/** Render a phone-number lifecycle status as a consistently-styled pill. */
export function PhoneNumberStatusBadge({ status }: { status: PhoneNumberStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>;
}
