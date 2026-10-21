import { expect, test } from "@playwright/test";

test.describe("OvozAI auth pages", () => {
  test("renders the login form without a backend", async ({ page }) => {
    await page.goto("/login");

    await expect(
      page.getByRole("heading", { name: /sign in to ovozai/i, level: 3 }),
    ).toBeVisible();

    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();

    // Link through to the registration page.
    await expect(page.getByRole("link", { name: /create one/i })).toBeVisible();
  });

  test("links from the landing header to sign in", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("banner").getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
