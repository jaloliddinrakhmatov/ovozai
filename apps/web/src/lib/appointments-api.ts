import {
  API_ROUTES,
  appointmentDtoSchema,
  createAppointmentRequestSchema,
  paginated,
  updateAppointmentRequestSchema,
  type AppointmentDto,
  type AppointmentStatus,
  type CreateAppointmentRequest,
  type UpdateAppointmentRequest,
} from "@ovozai/contracts";
import { apiFetch } from "./api-client";
import type { PaginatedResult } from "./auth-api";

const appointmentListSchema = paginated(appointmentDtoSchema);

/** `GET /appointments` — list appointments with optional status/date filters (VIEWER+). */
export async function listAppointments(params?: {
  limit?: number;
  cursor?: string;
  status?: AppointmentStatus;
  customerId?: string;
  from?: string;
  to?: string;
}): Promise<PaginatedResult<AppointmentDto>> {
  const search = new URLSearchParams();
  if (params?.limit !== undefined) search.set("limit", String(params.limit));
  if (params?.cursor) search.set("cursor", params.cursor);
  if (params?.status) search.set("status", params.status);
  if (params?.customerId) search.set("customerId", params.customerId);
  if (params?.from) search.set("from", params.from);
  if (params?.to) search.set("to", params.to);
  const query = search.toString();
  const path = query
    ? `${API_ROUTES.appointments.root}?${query}`
    : API_ROUTES.appointments.root;
  const data = await apiFetch(path);
  return appointmentListSchema.parse(data);
}

/** `POST /appointments` — book an appointment (MEMBER+). */
export async function createAppointment(
  input: CreateAppointmentRequest,
): Promise<AppointmentDto> {
  const body = createAppointmentRequestSchema.parse(input);
  const data = await apiFetch(API_ROUTES.appointments.root, { method: "POST", body });
  return appointmentDtoSchema.parse(data);
}

/** `GET /appointments/:id` — fetch a single appointment (VIEWER+). */
export async function getAppointment(id: string): Promise<AppointmentDto> {
  const data = await apiFetch(API_ROUTES.appointments.byId(id));
  return appointmentDtoSchema.parse(data);
}

/** `PATCH /appointments/:id` — reschedule, change status, or edit notes (MEMBER+). */
export async function updateAppointment(
  id: string,
  input: UpdateAppointmentRequest,
): Promise<AppointmentDto> {
  const body = updateAppointmentRequestSchema.parse(input);
  const data = await apiFetch(API_ROUTES.appointments.byId(id), { method: "PATCH", body });
  return appointmentDtoSchema.parse(data);
}

/** `DELETE /appointments/:id` — cancel/remove an appointment (MEMBER+). */
export async function deleteAppointment(id: string): Promise<void> {
  await apiFetch(API_ROUTES.appointments.byId(id), { method: "DELETE" });
}
