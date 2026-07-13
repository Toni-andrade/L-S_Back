import { defineConfig } from "@playwright/test";

/**
 * Smoke suite (spec Section 13). Env-gated so it never runs accidentally:
 *   SMOKE_BASE_URL (default http://localhost:3000)
 *   SMOKE_EMAIL / SMOKE_PASSWORD  (an active seeded user)
 * Run: pnpm --filter @ls/web smoke   (after `npx playwright install chromium`)
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: process.env.SMOKE_BASE_URL ?? "http://localhost:3000",
    screenshot: "only-on-failure",
  },
});
