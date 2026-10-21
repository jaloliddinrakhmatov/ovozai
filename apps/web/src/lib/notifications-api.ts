import {
  API_ROUTES,
  notificationDtoSchema,
  paginated,
  type NotificationDto,
  type NotificationStatus,
} from "@ovozai/contracts";
import { apiFetch } from "./api-client";
import type { PaginatedResult } from "./auth-api";

const notificationListSchema = paginated(notificationDtoSchema);

/** Filters accepted by {@link listNotifications}; mirror `notificationListQuerySchema`. */
export interface ListNotificationsParams {
  limit?: number;
  cursor?: string;
  event?: string;
  status?: NotificationStatus;
}

/** `GET /notifications` — the active org's notification log, newest first (VIEWER+). */
export async function listNotifications(
  params?: ListNotificationsParams,
): Promise<PaginatedResult<NotificationDto>> {
  const search = new URLSearchParams();
  if (params?.limit !== undefined) search.set("limit", String(params.limit));
  if (params?.cursor) search.set("cursor", params.cursor);
  if (params?.event) search.set("event", params.event);
  if (params?.status) search.set("status", params.status);
  const query = search.toString();
  const path = query
    ? `${API_ROUTES.notifications.root}?${query}`
    : API_ROUTES.notifications.root;
  const data = await apiFetch(path);
  return notificationListSchema.parse(data);
}
