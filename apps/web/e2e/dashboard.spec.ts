import { expect, test } from "@playwright/test";

/**
 * The Phase 3 dashboard screens live behind the authenticated shell. Without a
 * session (and without a live backend) they must behave like every other
 * dashboard route: hydrate as anonymous and redirect to the sign-in page.
 */
const PROTECTED_ROUTES = [
  "/dashboard/agents",
  "/dashboard/knowledge",
  "/dashboard/customers",
  "/dashboard/appointments",
  "/dashboard/calls",
  "/dashboard/phone-numbers",
  "/dashboard/webhooks",
  "/dashboard/wer",
  "/dashboard/billing",
  "/dashboard/integrations",
  "/dashboard/notifications",
];

test.describe("Phase 3 dashboard routes", () => {
  for (const route of PROTECTED_ROUTES) {
    test(`redirects ${route} to login when unauthenticated`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/);
      await expect(
        page.getByRole("heading", { name: /sign in to ovozai/i, level: 3 }),
      ).toBeVisible();
    });
  }
});
