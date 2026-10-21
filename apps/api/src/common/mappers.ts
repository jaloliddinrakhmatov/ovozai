import type {
  Agent,
  AgentVersion,
  ApiKey,
  Appointment,
  Customer,
  Invitation,
  KnowledgeBase,
  KnowledgeDocument,
  Membership,
  Organization,
  User,
} from "@ovozai/database";
import type {
  AgentConfig,
  AgentDto,
  AgentVersionDto,
  ApiKeyDto,
  AppointmentDto,
  CustomerDto,
  InvitationDto,
  KnowledgeBaseDto,
  KnowledgeDocumentDto,
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

export function toAgentDto(agent: Agent): AgentDto {
  return {
    id: agent.id,
    organizationId: agent.organizationId,
    name: agent.name,
    status: agent.status,
    defaultLanguage: agent.defaultLanguage,
    systemPrompt: agent.systemPrompt ?? null,
    voiceId: agent.voiceId ?? null,
    greeting: agent.greeting ?? null,
    transferNumber: agent.transferNumber ?? null,
    config: (agent.config ?? null) as AgentConfig | null,
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
  };
}

export function toAgentVersionDto(version: AgentVersion): AgentVersionDto {
  return {
    id: version.id,
    agentId: version.agentId,
    version: version.version,
    config: version.config as AgentConfig,
    publishedAt: version.publishedAt.toISOString(),
  };
}

export function toKnowledgeBaseDto(kb: KnowledgeBase): KnowledgeBaseDto {
  return {
    id: kb.id,
    organizationId: kb.organizationId,
    agentId: kb.agentId ?? null,
    name: kb.name,
    status: kb.status,
    createdAt: kb.createdAt.toISOString(),
    updatedAt: kb.updatedAt.toISOString(),
  };
}

export function toKnowledgeDocumentDto(
  doc: KnowledgeDocument,
  chunkCount = 0,
): KnowledgeDocumentDto {
  return {
    id: doc.id,
    knowledgeBaseId: doc.knowledgeBaseId,
    organizationId: doc.organizationId,
    title: doc.title,
    sourceType: doc.sourceType,
    status: doc.status,
    bytes: doc.bytes ?? null,
    chunkCount,
    error: doc.error ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function toCustomerDto(customer: Customer): CustomerDto {
  return {
    id: customer.id,
    organizationId: customer.organizationId,
    phoneE164: customer.phoneE164,
    name: customer.name ?? null,
    email: customer.email ?? null,
    locale: customer.locale,
    notes: customer.notes ?? null,
    tags: customer.tags,
    lastContactedAt: iso(customer.lastContactedAt),
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  };
}

export function toAppointmentDto(appointment: Appointment): AppointmentDto {
  return {
    id: appointment.id,
    organizationId: appointment.organizationId,
    customerId: appointment.customerId,
    agentId: appointment.agentId ?? null,
    title: appointment.title,
    notes: appointment.notes ?? null,
    startsAt: appointment.startsAt.toISOString(),
    endsAt: iso(appointment.endsAt),
    status: appointment.status,
    externalCalendarId: appointment.externalCalendarId ?? null,
    createdAt: appointment.createdAt.toISOString(),
    updatedAt: appointment.updatedAt.toISOString(),
  };
}
