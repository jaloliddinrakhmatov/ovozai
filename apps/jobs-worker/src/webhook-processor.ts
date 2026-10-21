import { createHmac } from "node:crypto";
import type { WebhookJob } from "@ovozai/contracts";
import type { PrismaClient } from "@ovozai/database";

export interface WebhookProcessorDeps {
  prisma: PrismaClient;
}

export interface WebhookProcessResult {
  status: "succeeded" | "failed" | "skipped";
  responseStatus?: number;
}

/**
 * Deliver one outbound webhook: sign the payload HMAC-SHA256 over `"<t>.<body>"`
 * with the endpoint secret (docs/API.md §13), POST it, and record the attempt.
 * Throws on failure so BullMQ retries with backoff; the terminal attempt stays
 * FAILED. Scoped by explicit organizationId (worker uses the base client).
 */
export async function processWebhookJob(
  deps: WebhookProcessorDeps,
  job: WebhookJob,
): Promise<WebhookProcessResult> {
  const { prisma } = deps;

  const delivery = await prisma.webhookDelivery.findFirst({
    where: { id: job.deliveryId, organizationId: job.organizationId },
  });
  if (!delivery) {
    return { status: "skipped" };
  }
  const endpoint = await prisma.webhookEndpoint.findFirst({
    where: { id: delivery.endpointId },
  });
  if (!endpoint || endpoint.status !== "ACTIVE" || endpoint.deletedAt) {
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: "FAILED", attempts: delivery.attempts + 1, lastAttemptAt: new Date() },
    });
    return { status: "failed" };
  }

  const body = JSON.stringify({
    id: delivery.id,
    type: delivery.event,
    createdAt: delivery.createdAt.toISOString(),
    data: delivery.payload,
  });
  const t = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", endpoint.secret).update(`${t}.${body}`).digest("hex");

  let responseStatus: number | undefined;
  let ok: boolean;
  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "OvozAI-Signature": `t=${t},v1=${signature}`,
        "OvozAI-Event": delivery.event,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    responseStatus = response.status;
    ok = response.ok;
  } catch {
    ok = false;
  }

  await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: {
      status: ok ? "SUCCEEDED" : "FAILED",
      attempts: delivery.attempts + 1,
      responseStatus: responseStatus ?? null,
      lastAttemptAt: new Date(),
    },
  });

  if (!ok) {
    throw new Error(`webhook delivery ${delivery.id} failed (status ${responseStatus ?? "network"})`);
  }
  return { status: "succeeded", responseStatus };
}
