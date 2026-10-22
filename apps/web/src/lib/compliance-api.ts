import {
  API_ROUTES,
  erasureRequestSchema,
  erasureResultSchema,
  retentionPolicySchema,
  rlsStatusSchema,
  updateRetentionPolicyRequestSchema,
  type ErasureRequest,
  type ErasureResult,
  type RetentionPolicy,
  type RlsStatus,
  type UpdateRetentionPolicyRequest,
} from "@ovozai/contracts";
import { apiFetch } from "./api-client";

/** Acknowledgement returned by {@link runRetentionSweep} (parsed leniently). */
export interface RetentionSweepAck {
  queued: boolean;
}

/** `GET /compliance/rls-status` — live RLS defense-in-depth self-check (ADMIN+). */
export async function getRlsStatus(): Promise<RlsStatus> {
  const data = await apiFetch(API_ROUTES.compliance.rlsStatus);
  return rlsStatusSchema.parse(data);
}

/** `GET /compliance/retention` — this organization's data-retention policy (ADMIN+). */
export async function getRetentionPolicy(): Promise<RetentionPolicy> {
  const data = await apiFetch(API_ROUTES.compliance.retention);
  return retentionPolicySchema.parse(data);
}

/**
 * `PUT /compliance/retention` — update the retention policy (OWNER). Either field
 * may be a number of days or `null` (retain indefinitely).
 */
export async function updateRetentionPolicy(
  input: UpdateRetentionPolicyRequest,
): Promise<RetentionPolicy> {
  const body = updateRetentionPolicyRequestSchema.parse(input);
  const data = await apiFetch(API_ROUTES.compliance.retention, { method: "PUT", body });
  return retentionPolicySchema.parse(data);
}

/** `POST /compliance/erasure` — erase one customer's personal data (OWNER). */
export async function eraseCustomer(input: ErasureRequest): Promise<ErasureResult> {
  const body = erasureRequestSchema.parse(input);
  const data = await apiFetch(API_ROUTES.compliance.erasure, { method: "POST", body });
  return erasureResultSchema.parse(data);
}

/**
 * `POST /compliance/retention/sweep` — enqueue a retention sweep for this
 * organization (OWNER).
 *
 * Responds `202 Accepted` with a small JSON `{ queued: true }` body; the sweep
 * itself runs asynchronously in the jobs worker. The body is read leniently
 * rather than validated against a schema.
 */
export async function runRetentionSweep(): Promise<RetentionSweepAck> {
  const data = await apiFetch(API_ROUTES.compliance.retentionSweep, { method: "POST" });
  const queued =
    typeof data === "object" && data !== null && "queued" in data
      ? Boolean((data as { queued: unknown }).queued)
      : true;
  return { queued };
}
