import { expect, test } from "@playwright/test";

test.describe("OvozAI landing page", () => {
  test("renders the wordmark, hero, and backend status pill", async ({
    page,
  }) => {
    await page.goto("/");

    // Wordmark in the header.
    await expect(
      page.getByRole("banner").getByText("OvozAI"),
    ).toBeVisible();

    // Hero headline.
    await expect(
      page.getByRole("heading", {
        name: /AI voice receptionists for Uzbekistan/i,
        level: 1,
      }),
    ).toBeVisible();

    // Live backend-connection status pill.
    const status = page.getByRole("status");
    await expect(status).toBeVisible();
    await expect(status).toContainText(/API/i);
  });
});
