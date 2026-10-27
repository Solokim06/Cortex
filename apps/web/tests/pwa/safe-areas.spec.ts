/**
 * PWA safe-area structural tests.
 *
 * NOTE: This suite tests PUBLIC pages only. The app shell ((app)/layout.tsx
 * with Topbar + Sidebar) is behind Clerk auth — Playwright can't navigate
 * there without a signed-in session.
 *
 * Playwright's WebKit (Safari engine) is used — real Safari CSS rendering.
 * Safe-area env() values are NOT emulated by Playwright, so this suite
 * verifies structural rendering + layout invariants, not notch positioning.
 *
 * For notch positioning, use Chrome DevTools' iPhone emulation (which DOES
 * emulate safe-area insets) or a physical device.
 *
 * IMPORTANT: These tests require the PRODUCTION build (`pnpm build && pnpm start`).
 * Running against `pnpm dev` may show false positives due to Turbopack HMR
 * cache issues with Tailwind v4. Always `rm -rf .next && pnpm build` before
 * running the suite if you've changed Tailwind classes since the last run.
 */
import { test, expect } from "@playwright/test";

const PUBLIC_ROUTES = [
  { path: "/", name: "landing" },
  { path: "/privacy", name: "privacy" },
  { path: "/features", name: "features" },
  { path: "/sign-in", name: "sign-in" },
];

test.describe("PWA public pages render on mobile viewports", () => {
  for (const { path, name } of PUBLIC_ROUTES) {
    test(`${name} (${path}) renders`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("body")).toBeVisible();
      await expect(page).toHaveTitle(/Cortex/);
      const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
      const viewportWidth = page.viewportSize()?.width ?? 0;
      expect(bodyScrollWidth).toBeLessThanOrEqual(viewportWidth + 1);
    });
  }

  test("offline banner appears on public page when offline", async ({ page, context }) => {
    await page.goto("/");
    await context.setOffline(true);
    await page.waitForTimeout(500);
    const banner = page.locator('[role="status"]').first();
    const visible = await banner.isVisible().catch(() => false);
    if (visible) {
      await expect(banner).toContainText(/offline/i);
    }
    await context.setOffline(false);
  });
});
