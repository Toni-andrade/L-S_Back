import { expect, test } from "@playwright/test";

/**
 * The one smoke path from the spec: login -> client page renders holdings ->
 * create ticket -> generate draft proposal. Requires the seed script to have
 * run (node scripts/seed.mjs) and SMOKE_EMAIL/SMOKE_PASSWORD for an active user.
 */
const EMAIL = process.env.SMOKE_EMAIL;
const PASSWORD = process.env.SMOKE_PASSWORD;

test.skip(!EMAIL || !PASSWORD, "SMOKE_EMAIL / SMOKE_PASSWORD not set");

test("login, review a client, open a ticket, draft a proposal", async ({ page }) => {
  // Login
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(EMAIL!);
  await page.locator('input[type="password"]').fill(PASSWORD!);
  await page.getByRole("button", { name: /sign in|log in|entrar/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));

  // Client page renders holdings
  await page.goto("/clients");
  await page.locator('a[href^="/portfolio-review/client/"]').first().click();
  await expect(page.getByText("Holdings")).toBeVisible();

  // Create a ticket
  await page.goto("/tickets/new");
  const ticketTitle = `Smoke ticket ${Date.now()}`;
  await page.locator('input[name="title"]').fill(ticketTitle);
  await page.getByRole("button", { name: /create ticket/i }).click();
  await page.waitForURL(/\/tickets\/[0-9a-f-]{36}/);
  await expect(page.getByText(ticketTitle)).toBeVisible();

  // Draft a proposal (single 100% strategy)
  await page.goto("/proposals/new");
  await page.locator('input[name="clientName"]').fill("Smoke Client");
  await page.locator('input[name="salutation"]').fill("Smoke");
  await page.locator('input[name="totalAum"]').fill("500000");
  await page.locator('input[name="monthYear"]').fill("Julho 2026");
  await page.locator('select[name="strategyKey"]').first().selectOption("NEUTRAL");
  await page.locator('input[name="strategyWeight"]').first().fill("100");
  await page.getByRole("button", { name: /save draft/i }).click();
  await page.waitForURL(/\/proposals\/[0-9a-f-]{36}/);
  await expect(page.getByText(/draft/i).first()).toBeVisible();
});
