import type {
  Agent,
  AgentVersion,
  ApiKey,
  Appointment,
  Call,
  CallEvent,
  Customer,
  Invitation,
  Integration,
  KnowledgeBase,
  KnowledgeDocument,
  Membership,
  Notification,
  Organization,
  PhoneNumber,
  Plan,
  Subscription,
  Transcript,
  TranscriptTurn,
  User,
  WebhookDelivery,
  WebhookEndpoint,
  WerMeasurement,
} from "@ovozai/database";
import type {
  AgentConfig,
  AgentDto,
  AgentVersionDto,
  ApiKeyDto,
  AppointmentDto,
  CallDto,
  CallEventDto,
  CustomerDto,
  InvitationDto,
  KnowledgeBaseDto,
  KnowledgeDocumentDto,
  IntegrationDto,
  MembershipDto,
  MembershipWithUserDto,
  NotificationDto,
  OrganizationDto,
  PhoneNumberDto,
  PlanDto,
  SubscriptionDto,
  TranscriptDto,
  TranscriptTurnDto,
  UserDto,
  WebhookDeliveryDto,
  WebhookEndpointDto,
  WerMeasurementDto,
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
    callId: appointment.callId ?? null,
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

export function toCallDto(call: Call): CallDto {
  return {
    id: call.id,
    organizationId: call.organizationId,
    agentId: call.agentId ?? null,
    customerId: call.customerId ?? null,
    direction: call.direction,
    status: call.status,
    fromE164: call.fromE164 ?? null,
    toE164: call.toE164 ?? null,
    language: call.language,
    startedAt: call.startedAt.toISOString(),
    answeredAt: iso(call.answeredAt),
    endedAt: iso(call.endedAt),
    durationSec: call.durationSec ?? null,
    endedReason: call.endedReason ?? null,
    recordingObjectKey: call.recordingObjectKey ?? null,
    recordingConsent: call.recordingConsent,
    costCents: call.costCents ?? null,
    phoneNumberId: call.phoneNumberId ?? null,
    transferredTo: call.transferredTo ?? null,
    externalRef: call.externalRef ?? null,
    createdAt: call.createdAt.toISOString(),
    updatedAt: call.updatedAt.toISOString(),
  };
}

export function toCallEventDto(event: CallEvent): CallEventDto {
  return {
    id: event.id,
    callId: event.callId,
    type: event.type,
    payload: event.payload ?? null,
    occurredAt: event.occurredAt.toISOString(),
  };
}

export function toTranscriptTurnDto(turn: TranscriptTurn): TranscriptTurnDto {
  return {
    id: turn.id,
    role: turn.role,
    text: turn.text,
    startMs: turn.startMs,
    endMs: turn.endMs ?? null,
    confidence: turn.confidence ?? null,
    language: turn.language ?? null,
  };
}

export function toTranscriptDto(
  transcript: Transcript & { turns: TranscriptTurn[] },
): TranscriptDto {
  return {
    id: transcript.id,
    callId: transcript.callId,
    language: transcript.language,
    fullText: transcript.fullText ?? null,
    turns: transcript.turns.map(toTranscriptTurnDto),
  };
}

export function toPhoneNumberDto(number: PhoneNumber): PhoneNumberDto {
  return {
    id: number.id,
    organizationId: number.organizationId,
    e164: number.e164,
    provider: number.provider,
    providerNumberId: number.providerNumberId ?? null,
    agentId: number.agentId ?? null,
    status: number.status,
    capabilities: number.capabilities,
    createdAt: number.createdAt.toISOString(),
    updatedAt: number.updatedAt.toISOString(),
  };
}

export function toWebhookEndpointDto(endpoint: WebhookEndpoint): WebhookEndpointDto {
  return {
    id: endpoint.id,
    organizationId: endpoint.organizationId,
    url: endpoint.url,
    events: endpoint.events,
    status: endpoint.status,
    createdAt: endpoint.createdAt.toISOString(),
    updatedAt: endpoint.updatedAt.toISOString(),
  };
}

export function toWebhookDeliveryDto(delivery: WebhookDelivery): WebhookDeliveryDto {
  return {
    id: delivery.id,
    endpointId: delivery.endpointId,
    event: delivery.event,
    status: delivery.status,
    attempts: delivery.attempts,
    responseStatus: delivery.responseStatus ?? null,
    lastAttemptAt: iso(delivery.lastAttemptAt),
    createdAt: delivery.createdAt.toISOString(),
  };
}

export function toPlanDto(plan: Plan): PlanDto {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    priceCents: plan.priceCents,
    currency: plan.currency,
    limits: (plan.limits ?? null) as PlanDto["limits"],
    active: plan.active,
  };
}

export function toSubscriptionDto(
  subscription: Subscription & { plan: { code: string } },
): SubscriptionDto {
  return {
    id: subscription.id,
    organizationId: subscription.organizationId,
    planId: subscription.planId,
    planCode: subscription.plan.code,
    status: subscription.status,
    currentPeriodStart: subscription.currentPeriodStart.toISOString(),
    currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
    createdAt: subscription.createdAt.toISOString(),
  };
}

export function toIntegrationDto(integration: Integration): IntegrationDto {
  return {
    id: integration.id,
    organizationId: integration.organizationId,
    type: integration.type,
    provider: integration.provider,
    status: integration.status,
    config: (integration.config ?? null) as IntegrationDto["config"],
    createdAt: integration.createdAt.toISOString(),
    updatedAt: integration.updatedAt.toISOString(),
  };
}

export function toNotificationDto(notification: Notification): NotificationDto {
  return {
    id: notification.id,
    channel: notification.channel,
    status: notification.status,
    event: notification.event,
    recipient: notification.recipient ?? null,
    subject: notification.subject ?? null,
    body: notification.body,
    sentAt: iso(notification.sentAt),
    createdAt: notification.createdAt.toISOString(),
  };
}

export function toWerMeasurementDto(measurement: WerMeasurement): WerMeasurementDto {
  return {
    id: measurement.id,
    provider: measurement.provider,
    language: measurement.language,
    wer: measurement.wer,
    substitutions: measurement.substitutions,
    deletions: measurement.deletions,
    insertions: measurement.insertions,
    referenceWords: measurement.referenceWords,
    callId: measurement.callId ?? null,
    createdAt: measurement.createdAt.toISOString(),
  };
}
