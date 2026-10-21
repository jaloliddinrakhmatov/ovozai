import {
  API_ROUTES,
  createPhoneNumberRequestSchema,
  paginated,
  phoneNumberDtoSchema,
  updatePhoneNumberRequestSchema,
  type CreatePhoneNumberRequest,
  type PhoneNumberDto,
  type PhoneNumberStatus,
  type UpdatePhoneNumberRequest,
} from "@ovozai/contracts";
import { apiFetch } from "./api-client";
import type { PaginatedResult } from "./auth-api";

const phoneNumberListSchema = paginated(phoneNumberDtoSchema);

/** Filters accepted by {@link listPhoneNumbers}; mirror `phoneNumberListQuerySchema`. */
export interface ListPhoneNumbersParams {
  limit?: number;
  cursor?: string;
  status?: PhoneNumberStatus;
}

/** `GET /phone-numbers` — list the active org's numbers (VIEWER+). */
export async function listPhoneNumbers(
  params?: ListPhoneNumbersParams,
): Promise<PaginatedResult<PhoneNumberDto>> {
  const search = new URLSearchParams();
  if (params?.limit !== undefined) search.set("limit", String(params.limit));
  if (params?.cursor) search.set("cursor", params.cursor);
  if (params?.status) search.set("status", params.status);
  const query = search.toString();
  const path = query ? `${API_ROUTES.phoneNumbers.root}?${query}` : API_ROUTES.phoneNumbers.root;
  const data = await apiFetch(path);
  return phoneNumberListSchema.parse(data);
}

/** `POST /phone-numbers` — provision a number (ADMIN+). */
export async function createPhoneNumber(input: CreatePhoneNumberRequest): Promise<PhoneNumberDto> {
  const body = createPhoneNumberRequestSchema.parse(input);
  const data = await apiFetch(API_ROUTES.phoneNumbers.root, { method: "POST", body });
  return phoneNumberDtoSchema.parse(data);
}

/** `PATCH /phone-numbers/:id` — route to an agent or change status (ADMIN+). */
export async function updatePhoneNumber(
  id: string,
  input: UpdatePhoneNumberRequest,
): Promise<PhoneNumberDto> {
  const body = updatePhoneNumberRequestSchema.parse(input);
  const data = await apiFetch(API_ROUTES.phoneNumbers.byId(id), { method: "PATCH", body });
  return phoneNumberDtoSchema.parse(data);
}

/** `DELETE /phone-numbers/:id` — release the number (ADMIN+). */
export async function releasePhoneNumber(id: string): Promise<void> {
  await apiFetch(API_ROUTES.phoneNumbers.byId(id), { method: "DELETE" });
}
