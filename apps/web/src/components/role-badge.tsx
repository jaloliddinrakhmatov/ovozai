import { Badge, type BadgeVariant } from "@ovozai/ui";
import type { MembershipRole } from "@ovozai/contracts";

const ROLE_VARIANT: Record<MembershipRole, BadgeVariant> = {
  OWNER: "default",
  ADMIN: "secondary",
  MEMBER: "outline",
  VIEWER: "outline",
};

/** Render a membership role as a consistently-styled pill. */
export function RoleBadge({ role }: { role: MembershipRole }) {
  return <Badge variant={ROLE_VARIANT[role]}>{role}</Badge>;
}
