import {
  API_ROUTES,
  createCustomerRequestSchema,
  customerDtoSchema,
  paginated,
  updateCustomerRequestSchema,
  type CreateCustomerRequest,
  type CustomerDto,
  type UpdateCustomerRequest,
} from "@ovozai/contracts";
import { apiFetch } from "./api-client";
import type { PaginatedResult } from "./auth-api";

const customerListSchema = paginated(customerDtoSchema);

/** `GET /customers` — list/search customers in the active org (VIEWER+). */
export async function listCustomers(params?: {
  limit?: number;
  cursor?: string;
  q?: string;
  phoneE164?: string;
}): Promise<PaginatedResult<CustomerDto>> {
  const search = new URLSearchParams();
  if (params?.limit !== undefined) search.set("limit", String(params.limit));
  if (params?.cursor) search.set("cursor", params.cursor);
  if (params?.q) search.set("q", params.q);
  if (params?.phoneE164) search.set("phoneE164", params.phoneE164);
  const query = search.toString();
  const path = query ? `${API_ROUTES.customers.root}?${query}` : API_ROUTES.customers.root;
  const data = await apiFetch(path);
  return customerListSchema.parse(data);
}

/** `POST /customers` — create a customer (MEMBER+). */
export async function createCustomer(input: CreateCustomerRequest): Promise<CustomerDto> {
  const body = createCustomerRequestSchema.parse(input);
  const data = await apiFetch(API_ROUTES.customers.root, { method: "POST", body });
  return customerDtoSchema.parse(data);
}

/** `GET /customers/:id` — fetch a single customer (VIEWER+). */
export async function getCustomer(id: string): Promise<CustomerDto> {
  const data = await apiFetch(API_ROUTES.customers.byId(id));
  return customerDtoSchema.parse(data);
}

/** `PATCH /customers/:id` — update a customer (MEMBER+). */
export async function updateCustomer(
  id: string,
  input: UpdateCustomerRequest,
): Promise<CustomerDto> {
  const body = updateCustomerRequestSchema.parse(input);
  const data = await apiFetch(API_ROUTES.customers.byId(id), { method: "PATCH", body });
  return customerDtoSchema.parse(data);
}

/** `DELETE /customers/:id` — delete a customer (ADMIN+). */
export async function deleteCustomer(id: string): Promise<void> {
  await apiFetch(API_ROUTES.customers.byId(id), { method: "DELETE" });
}
