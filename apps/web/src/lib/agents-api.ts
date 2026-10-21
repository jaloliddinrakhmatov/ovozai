import {
  API_ROUTES,
  agentDtoSchema,
  agentVersionDtoSchema,
  createAgentRequestSchema,
  paginated,
  updateAgentRequestSchema,
  type AgentDto,
  type AgentVersionDto,
  type CreateAgentRequest,
  type UpdateAgentRequest,
} from "@ovozai/contracts";
import { apiFetch } from "./api-client";
import type { PaginatedResult } from "./auth-api";

const agentListSchema = paginated(agentDtoSchema);
const agentVersionListSchema = paginated(agentVersionDtoSchema);

/** `GET /agents` — list agents in the active org (VIEWER+). */
export async function listAgents(params?: {
  limit?: number;
  cursor?: string;
}): Promise<PaginatedResult<AgentDto>> {
  const search = new URLSearchParams();
  if (params?.limit !== undefined) search.set("limit", String(params.limit));
  if (params?.cursor) search.set("cursor", params.cursor);
  const query = search.toString();
  const path = query ? `${API_ROUTES.agents.root}?${query}` : API_ROUTES.agents.root;
  const data = await apiFetch(path);
  return agentListSchema.parse(data);
}

/** `POST /agents` — create an agent (ADMIN+). */
export async function createAgent(input: CreateAgentRequest): Promise<AgentDto> {
  const body = createAgentRequestSchema.parse(input);
  const data = await apiFetch(API_ROUTES.agents.root, { method: "POST", body });
  return agentDtoSchema.parse(data);
}

/** `GET /agents/:id` — fetch a single agent (VIEWER+). */
export async function getAgent(id: string): Promise<AgentDto> {
  const data = await apiFetch(API_ROUTES.agents.byId(id));
  return agentDtoSchema.parse(data);
}

/** `PATCH /agents/:id` — update an agent's configuration (ADMIN+). */
export async function updateAgent(id: string, input: UpdateAgentRequest): Promise<AgentDto> {
  const body = updateAgentRequestSchema.parse(input);
  const data = await apiFetch(API_ROUTES.agents.byId(id), { method: "PATCH", body });
  return agentDtoSchema.parse(data);
}

/** `DELETE /agents/:id` — delete an agent (ADMIN+). */
export async function deleteAgent(id: string): Promise<void> {
  await apiFetch(API_ROUTES.agents.byId(id), { method: "DELETE" });
}

/** `POST /agents/:id/publish` — snapshot the current config as a new version (ADMIN+). */
export async function publishAgent(id: string): Promise<AgentVersionDto> {
  const data = await apiFetch(API_ROUTES.agents.publish(id), { method: "POST" });
  return agentVersionDtoSchema.parse(data);
}

/** `GET /agents/:id/versions` — list published versions, newest first (VIEWER+). */
export async function listAgentVersions(
  id: string,
  params?: { limit?: number; cursor?: string },
): Promise<PaginatedResult<AgentVersionDto>> {
  const search = new URLSearchParams();
  if (params?.limit !== undefined) search.set("limit", String(params.limit));
  if (params?.cursor) search.set("cursor", params.cursor);
  const query = search.toString();
  const base = API_ROUTES.agents.versions(id);
  const path = query ? `${base}?${query}` : base;
  const data = await apiFetch(path);
  return agentVersionListSchema.parse(data);
}

/** `POST /agents/:id/versions/:version/restore` — restore a published version (ADMIN+). */
export async function restoreAgentVersion(id: string, version: number): Promise<AgentDto> {
  const data = await apiFetch(API_ROUTES.agents.restoreVersion(id, version), { method: "POST" });
  return agentDtoSchema.parse(data);
}
