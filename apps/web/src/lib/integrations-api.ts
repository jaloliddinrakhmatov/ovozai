import {
  API_ROUTES,
  createIntegrationRequestSchema,
  integrationDtoSchema,
  paginated,
  type CreateIntegrationRequest,
  type IntegrationDto,
} from "@ovozai/contracts";
import { apiFetch } from "./api-client";
import type { PaginatedResult } from "./auth-api";

const integrationListSchema = paginated(integrationDtoSchema);

/** `GET /integrations` — list connected integrations for the active org (ADMIN+). */
export async function listIntegrations(params?: {
  limit?: number;
  cursor?: string;
}): Promise<PaginatedResult<IntegrationDto>> {
  const search = new URLSearchParams();
  if (params?.limit !== undefined) search.set("limit", String(params.limit));
  if (params?.cursor) search.set("cursor", params.cursor);
  const query = search.toString();
  const path = query ? `${API_ROUTES.integrations.root}?${query}` : API_ROUTES.integrations.root;
  const data = await apiFetch(path);
  return integrationListSchema.parse(data);
}

/**
 * `POST /integrations` — connect an integration (ADMIN+).
 *
 * `apiKey`, if supplied, is stored as a secret reference and never echoed back;
 * the returned {@link IntegrationDto} only carries non-secret `config`.
 */
export async function createIntegration(
  input: CreateIntegrationRequest,
): Promise<IntegrationDto> {
  const body = createIntegrationRequestSchema.parse(input);
  const data = await apiFetch(API_ROUTES.integrations.root, { method: "POST", body });
  return integrationDtoSchema.parse(data);
}

/** `DELETE /integrations/:id` — disconnect an integration (ADMIN+). */
export async function deleteIntegration(id: string): Promise<void> {
  await apiFetch(API_ROUTES.integrations.byId(id), { method: "DELETE" });
}
