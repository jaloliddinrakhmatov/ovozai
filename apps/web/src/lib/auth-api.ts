import {
  API_ROUTES,
  apiKeyCreatedDtoSchema,
  apiKeyDtoSchema,
  authSessionSchema,
  createApiKeyRequestSchema,
  createInvitationRequestSchema,
  createOrganizationRequestSchema,
  invitationCreatedDtoSchema,
  loginRequestSchema,
  meResponseSchema,
  membershipDtoSchema,
  membershipWithUserDtoSchema,
  organizationDtoSchema,
  paginated,
  registerRequestSchema,
  switchOrgRequestSchema,
  updateMembershipRoleRequestSchema,
  updateOrganizationRequestSchema,
  type ApiKeyCreatedDto,
  type ApiKeyDto,
  type AuthSession,
  type CreateApiKeyRequest,
  type CreateInvitationRequest,
  type CreateOrganizationRequest,
  type InvitationCreatedDto,
  type LoginRequest,
  type MeResponse,
  type MembershipDto,
  type MembershipRole,
  type MembershipWithUserDto,
  type OrganizationDto,
  type PageInfo,
  type RegisterRequest,
  type UpdateOrganizationRequest,
} from "@ovozai/contracts";
import { apiFetch } from "./api-client";

/** A cursor-paginated list envelope. */
export interface PaginatedResult<T> {
  data: T[];
  pageInfo: PageInfo;
}

const membershipListSchema = paginated(membershipWithUserDtoSchema);
const apiKeyListSchema = paginated(apiKeyDtoSchema);

// --- Auth -----------------------------------------------------------------

/** `POST /auth/register` — create an account (orgless) and open a session. */
export async function register(input: RegisterRequest): Promise<AuthSession> {
  const body = registerRequestSchema.parse(input);
  const data = await apiFetch(API_ROUTES.auth.register, { method: "POST", body, auth: false });
  return authSessionSchema.parse(data);
}

/** `POST /auth/login` — exchange credentials for a session. */
export async function login(input: LoginRequest): Promise<AuthSession> {
  const body = loginRequestSchema.parse(input);
  const data = await apiFetch(API_ROUTES.auth.login, { method: "POST", body, auth: false });
  return authSessionSchema.parse(data);
}

/** `POST /auth/logout` — revoke the current session server-side. */
export async function logout(): Promise<void> {
  await apiFetch(API_ROUTES.auth.logout, { method: "POST" });
}

/** `GET /auth/me` — hydrate the current user, active org, and memberships. */
export async function fetchMe(): Promise<MeResponse> {
  const data = await apiFetch(API_ROUTES.auth.me);
  return meResponseSchema.parse(data);
}

/** `POST /auth/switch-org` — re-issue tokens with a different active org. */
export async function switchOrganization(organizationId: string): Promise<AuthSession> {
  const body = switchOrgRequestSchema.parse({ organizationId });
  const data = await apiFetch(API_ROUTES.auth.switchOrg, { method: "POST", body });
  return authSessionSchema.parse(data);
}

// --- Organizations --------------------------------------------------------

/** `POST /organizations` — create an org; caller becomes OWNER. */
export async function createOrganization(
  input: CreateOrganizationRequest,
): Promise<AuthSession> {
  const body = createOrganizationRequestSchema.parse(input);
  const data = await apiFetch(API_ROUTES.organizations.root, { method: "POST", body });
  return authSessionSchema.parse(data);
}

/** `GET /organizations/current` — the active organization. */
export async function getCurrentOrganization(): Promise<OrganizationDto> {
  const data = await apiFetch(API_ROUTES.organizations.current);
  return organizationDtoSchema.parse(data);
}

/** `PATCH /organizations/current` — update the active organization (ADMIN+). */
export async function updateCurrentOrganization(
  input: UpdateOrganizationRequest,
): Promise<OrganizationDto> {
  const body = updateOrganizationRequestSchema.parse(input);
  const data = await apiFetch(API_ROUTES.organizations.current, { method: "PATCH", body });
  return organizationDtoSchema.parse(data);
}

// --- Memberships ----------------------------------------------------------

/** `GET /memberships` — list members of the active org (MEMBER+). */
export async function listMemberships(params?: {
  limit?: number;
  cursor?: string;
}): Promise<PaginatedResult<MembershipWithUserDto>> {
  const search = new URLSearchParams();
  if (params?.limit !== undefined) search.set("limit", String(params.limit));
  if (params?.cursor) search.set("cursor", params.cursor);
  const query = search.toString();
  const path = query ? `${API_ROUTES.memberships.root}?${query}` : API_ROUTES.memberships.root;
  const data = await apiFetch(path);
  return membershipListSchema.parse(data);
}

/** `POST /memberships/invites` — invite by email (ADMIN+). */
export async function createInvitation(
  input: CreateInvitationRequest,
): Promise<InvitationCreatedDto> {
  const body = createInvitationRequestSchema.parse(input);
  const data = await apiFetch(API_ROUTES.memberships.invites, { method: "POST", body });
  return invitationCreatedDtoSchema.parse(data);
}

/** `POST /memberships/invites/:token/accept` — join the org (re-issues tokens). */
export async function acceptInvitation(token: string): Promise<AuthSession> {
  const data = await apiFetch(API_ROUTES.memberships.acceptInvite(token), { method: "POST" });
  return authSessionSchema.parse(data);
}

/** `PATCH /memberships/:id` — change a member's role (ADMIN+). */
export async function updateMembershipRole(
  id: string,
  role: MembershipRole,
): Promise<MembershipDto> {
  const body = updateMembershipRoleRequestSchema.parse({ role });
  const data = await apiFetch(API_ROUTES.memberships.byId(id), { method: "PATCH", body });
  return membershipDtoSchema.parse(data);
}

/** `DELETE /memberships/:id` — remove a member (ADMIN+). */
export async function removeMembership(id: string): Promise<void> {
  await apiFetch(API_ROUTES.memberships.byId(id), { method: "DELETE" });
}

// --- API keys -------------------------------------------------------------

/** `GET /api-keys` — list keys of the active org (ADMIN+). */
export async function listApiKeys(params?: {
  limit?: number;
  cursor?: string;
}): Promise<PaginatedResult<ApiKeyDto>> {
  const search = new URLSearchParams();
  if (params?.limit !== undefined) search.set("limit", String(params.limit));
  if (params?.cursor) search.set("cursor", params.cursor);
  const query = search.toString();
  const path = query ? `${API_ROUTES.apiKeys.root}?${query}` : API_ROUTES.apiKeys.root;
  const data = await apiFetch(path);
  return apiKeyListSchema.parse(data);
}

/** `POST /api-keys` — create a key; the full secret is returned once (ADMIN+). */
export async function createApiKey(input: CreateApiKeyRequest): Promise<ApiKeyCreatedDto> {
  const body = createApiKeyRequestSchema.parse(input);
  const data = await apiFetch(API_ROUTES.apiKeys.root, { method: "POST", body });
  return apiKeyCreatedDtoSchema.parse(data);
}

/** `DELETE /api-keys/:id` — revoke a key (ADMIN+). */
export async function revokeApiKey(id: string): Promise<void> {
  await apiFetch(API_ROUTES.apiKeys.byId(id), { method: "DELETE" });
}
