import type { ApiKey, Invitation, Membership, Organization, User } from "@ovozai/database";
import type {
  ApiKeyDto,
  InvitationDto,
  MembershipDto,
  MembershipWithUserDto,
  OrganizationDto,
  UserDto,
} from "@ovozai/contracts";

const iso = (date: Date | null | undefined): string | null => (date ? date.toISOString() : null);

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    status: user.status,
    lastLoginAt: iso(user.lastLoginAt),
    createdAt: user.createdAt.toISOString(),
  };
}

export function toOrganizationDto(org: Organization): OrganizationDto {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    status: org.status,
    locale: org.locale,
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
  };
}

export function toMembershipDto(membership: Membership): MembershipDto {
  return {
    id: membership.id,
    organizationId: membership.organizationId,
    userId: membership.userId,
    role: membership.role,
    invitedAt: iso(membership.invitedAt),
    acceptedAt: iso(membership.acceptedAt),
    createdAt: membership.createdAt.toISOString(),
  };
}

export function toMembershipWithUserDto(membership: Membership & { user: User }): MembershipWithUserDto {
  return { ...toMembershipDto(membership), user: toUserDto(membership.user) };
}

export function toInvitationDto(invitation: Invitation): InvitationDto {
  return {
    id: invitation.id,
    organizationId: invitation.organizationId,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
  };
}

export function toApiKeyDto(key: ApiKey): ApiKeyDto {
  return {
    id: key.id,
    organizationId: key.organizationId,
    name: key.name,
    prefix: key.prefix,
    scopes: key.scopes,
    status: key.status,
    lastUsedAt: iso(key.lastUsedAt),
    expiresAt: iso(key.expiresAt),
    createdAt: key.createdAt.toISOString(),
  };
}
