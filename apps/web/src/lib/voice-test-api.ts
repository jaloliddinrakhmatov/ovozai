import {
  API_ROUTES,
  testSessionResponseSchema,
  type TestSessionResponse,
} from "@ovozai/contracts";
import { apiFetch } from "./api-client";

/**
 * `POST /agents/:id/test-session` — mint a short-lived ticket for a browser
 * "Test Agent" WebSocket session against the voice-worker gateway (MEMBER+).
 */
export async function createTestSession(agentId: string): Promise<TestSessionResponse> {
  const data = await apiFetch(API_ROUTES.agents.testSession(agentId), { method: "POST" });
  return testSessionResponseSchema.parse(data);
}
